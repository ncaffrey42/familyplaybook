#!/usr/bin/env python3
"""
plex_livetv_share.py - grant (or revoke) Live TV access for the people your
Plex Media Server is shared with, including friends who are NOT in your Plex Home.

Background
----------
Plex Media Server is closed source, so there is no server code to patch.  Live TV
is not a library either: it is a per-user permission on the plex.tv side of the
share, an integer flag called ``allowTuners``:

    0 = no Live TV
    1 = Live TV
    2 = Live TV + DVR

Plex Web only shows the "Allow Live TV" switch for Plex Home members, but the
plex.tv sharing API accepts ``allowTuners`` for any shared user.  This script
flips that flag through the same two API routes that Plex's own web app and the
open-source client libraries (python-plexapi, laravel-plex) use, then reads the
share back so you can see what plex.tv actually stored.

Requires only Python 3.8+ (standard library, no pip installs).

Quick start
-----------
    export PLEX_TOKEN=xxxxxxxxxxxxxxxxxxxx      # your (server owner) plex.tv token
    ./plex_livetv_share.py list                 # who is shared, and their Live TV flag
    ./plex_livetv_share.py enable --all         # Live TV for everyone shared on the server
    ./plex_livetv_share.py enable --user bob --level 2   # Live TV + DVR for one friend
    ./plex_livetv_share.py disable --user bob
    ./plex_livetv_share.py sync --interval 600  # keep re-applying forever (run next to PMS)

Add ``--dry-run`` to any command to see the calls without sending them.

Finding your token: https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/
"""

import argparse
import json
import os
import sys
import time
import uuid
import xml.etree.ElementTree as ET
from urllib import request, parse, error

PLEX_TV = "https://plex.tv"
PRODUCT = "plex-livetv-share"
VERSION = "1.0.0"


# --------------------------------------------------------------------------- #
# HTTP plumbing
# --------------------------------------------------------------------------- #
class PlexTV:
    def __init__(self, token, base_url=PLEX_TV, dry_run=False, verbose=False):
        self.token = token
        self.base = base_url.rstrip("/")
        self.dry_run = dry_run
        self.verbose = verbose
        self.client_id = self._client_identifier()

    @staticmethod
    def _client_identifier():
        """A stable identifier for this script on this machine (plex.tv wants one)."""
        path = os.path.join(os.path.expanduser("~"), ".plex_livetv_share_client_id")
        try:
            with open(path) as fh:
                cid = fh.read().strip()
                if cid:
                    return cid
        except OSError:
            pass
        cid = str(uuid.uuid4())
        try:
            with open(path, "w") as fh:
                fh.write(cid)
        except OSError:
            pass
        return cid

    def _headers(self, accept):
        return {
            "X-Plex-Token": self.token,
            "X-Plex-Client-Identifier": self.client_id,
            "X-Plex-Product": PRODUCT,
            "X-Plex-Version": VERSION,
            "X-Plex-Platform": sys.platform,
            "X-Plex-Device-Name": PRODUCT,
            "Accept": accept,
        }

    def _call(self, method, path, params=None, json_body=None, accept="application/xml", mutating=False):
        url = self.base + path
        if params:
            url += ("&" if "?" in url else "?") + parse.urlencode(params)
        data = None
        headers = self._headers(accept)
        if json_body is not None:
            data = json.dumps(json_body).encode()
            headers["Content-Type"] = "application/json"
        if self.verbose or (mutating and self.dry_run):
            body = f" body={json.dumps(json_body)}" if json_body is not None else ""
            prefix = "[dry-run] " if (mutating and self.dry_run) else ""
            print(f"  {prefix}{method} {url}{body}")
        if mutating and self.dry_run:
            return 0, b""
        req = request.Request(url, data=data, headers=headers, method=method)
        try:
            with request.urlopen(req, timeout=30) as resp:
                return resp.status, resp.read()
        except error.HTTPError as exc:
            return exc.code, exc.read()

    def get_xml(self, path, params=None):
        status, body = self._call("GET", path, params=params)
        if status >= 400:
            raise RuntimeError(f"GET {path} -> HTTP {status}: {body[:300]!r}")
        return ET.fromstring(body)

    def put(self, path, params=None, json_body=None, accept="application/json"):
        return self._call("PUT", path, params=params, json_body=json_body, accept=accept, mutating=True)

    def post(self, path, params=None, json_body=None, accept="application/json"):
        return self._call("POST", path, params=params, json_body=json_body, accept=accept, mutating=True)


# --------------------------------------------------------------------------- #
# plex.tv reads
# --------------------------------------------------------------------------- #
def owned_servers(api):
    """Servers this token owns: [(name, machineIdentifier)]."""
    root = api.get_xml("/pms/servers.xml")
    out = []
    for s in root.iter("Server"):
        if s.get("owned") == "1":
            out.append((s.get("name"), s.get("machineIdentifier")))
    return out


def shared_users(api, machine_id):
    """
    Everyone your account shares with, filtered to the people who have a share
    on ``machine_id``.  Returns dicts with the fields we care about.
    """
    root = api.get_xml("/api/users")
    users = []
    for u in root.iter("User"):
        share = None
        for s in u.findall("Server"):
            if s.get("machineIdentifier") == machine_id:
                share = s
                break
        if share is None:
            continue
        users.append({
            "id": int(u.get("id")),
            "title": u.get("title") or u.get("username") or u.get("email") or "",
            "username": u.get("username") or "",
            "email": u.get("email") or "",
            "home": u.get("home") == "1",
            "restricted": u.get("restricted") == "1",
            "allowTuners": int(u.get("allowTuners") or 0),
            "allowSync": u.get("allowSync") == "1",
            "sharedServerId": int(share.get("id")),
            "pending": share.get("pending") == "1",
            "allLibraries": share.get("allLibraries") == "1",
        })
    return users


def shared_section_ids(api, machine_id):
    """
    {sharedServerId: [plex.tv library section ids currently shared]}.
    plex.tv wants its own section ids (the ``id`` attribute), not the local
    library keys, when we re-post a share.
    """
    root = api.get_xml(f"/api/servers/{machine_id}/shared_servers")
    out = {}
    for ss in root.iter("SharedServer"):
        ids = [int(sec.get("id")) for sec in ss.findall("Section") if sec.get("shared") == "1"]
        out[int(ss.get("id"))] = ids
    return out


# --------------------------------------------------------------------------- #
# plex.tv writes
# --------------------------------------------------------------------------- #
def set_allow_tuners(api, machine_id, user, level, section_ids):
    """
    Push ``allowTuners=level`` for one user through both routes plex.tv exposes.

    Route A: PUT /api/v2/sharings/{userId}?allowTuners=N
             (same call python-plexapi uses for allowSync / allowChannels)
    Route B: POST /api/v2/shared_servers/{sharedServerId}
             {machineIdentifier, librarySectionIds, settings:{allowTuners}}
             (same call laravel-plex / Plex Web use to edit a share)

    Either one succeeding is enough; we try both so the change sticks whichever
    backend path plex.tv currently honours.  Returns a list of (route, status).
    """
    results = []
    status, _ = api.put(f"/api/v2/sharings/{user['id']}", params={"allowTuners": level})
    results.append(("PUT /api/v2/sharings", status))

    body = {
        "machineIdentifier": machine_id,
        "librarySectionIds": section_ids,
        "settings": {"allowTuners": str(level)},
    }
    status, _ = api.post(f"/api/v2/shared_servers/{user['sharedServerId']}", json_body=body)
    results.append(("POST /api/v2/shared_servers/{id}", status))
    return results


# --------------------------------------------------------------------------- #
# commands
# --------------------------------------------------------------------------- #
def resolve_server(api, args):
    servers = owned_servers(api)
    if args.machine_id:
        for name, mid in servers:
            if mid == args.machine_id:
                return name, mid
        return args.machine_id, args.machine_id
    if args.server:
        for name, mid in servers:
            if name.lower() == args.server.lower():
                return name, mid
        sys.exit(f"No owned server named {args.server!r}. Owned servers: {[n for n, _ in servers]}")
    if len(servers) == 1:
        return servers[0]
    if not servers:
        sys.exit("This token owns no Plex Media Servers. Use the server owner's token.")
    sys.exit("You own several servers; pick one with --server NAME or --machine-id ID: "
             + ", ".join(f"{n} ({m})" for n, m in servers))


def select_users(users, args):
    if getattr(args, "all", False):
        chosen = users
    else:
        wanted = {w.lower() for w in (args.user or [])}
        if not wanted:
            sys.exit("Give --user NAME/EMAIL/ID (repeatable) or --all.")
        chosen = [u for u in users
                  if {u["title"].lower(), u["username"].lower(), u["email"].lower(), str(u["id"])} & wanted]
        missing = wanted - {v for u in chosen for v in
                            (u["title"].lower(), u["username"].lower(), u["email"].lower(), str(u["id"]))}
        if missing:
            print(f"warning: not shared on this server (skipped): {sorted(missing)}")
    if not args.include_home:
        chosen = [u for u in chosen if not u["home"]]
    chosen = [u for u in chosen if not u["pending"]]
    return chosen


def describe(u):
    kind = "home" if u["home"] else "friend"
    if u["restricted"]:
        kind = "managed"
    tuners = {0: "no Live TV", 1: "Live TV", 2: "Live TV + DVR"}.get(u["allowTuners"], str(u["allowTuners"]))
    pend = " (invite pending)" if u["pending"] else ""
    return f"{u['title']:<28} {kind:<8} id={u['id']:<10} share={u['sharedServerId']:<10} {tuners}{pend}"


def cmd_list(api, args):
    name, mid = resolve_server(api, args)
    print(f"Server: {name} ({mid})\n")
    for u in shared_users(api, mid):
        print(describe(u))


def apply_level(api, mid, users, level, args):
    if not users:
        print("Nothing to do.")
        return
    sections = shared_section_ids(api, mid)
    for u in users:
        if u["allowTuners"] == level and not args.force:
            print(f"= {u['title']}: already {level}, skipping (use --force to resend)")
            continue
        print(f"> {u['title']}: allowTuners {u['allowTuners']} -> {level}")
        for route, status in set_allow_tuners(api, mid, u, level, sections.get(u["sharedServerId"], [])):
            tag = "dry-run" if status == 0 else ("ok" if status < 400 else f"HTTP {status}")
            print(f"    {route}: {tag}")
    if api.dry_run:
        return
    print("\nRead-back from plex.tv:")
    after = {u["id"]: u for u in shared_users(api, mid)}
    for u in users:
        now = after.get(u["id"], u)["allowTuners"]
        mark = "OK " if now == level else "!! "
        print(f"  {mark}{u['title']}: allowTuners={now}")
    if any(after.get(u["id"], u)["allowTuners"] != level for u in users):
        print("\nSome users did not take the new value. plex.tv accepted the request but\n"
              "kept the old flag; that means Plex is enforcing the Home-only rule server-side\n"
              "for those accounts and there is no client-side switch left to flip.")


def cmd_enable(api, args):
    name, mid = resolve_server(api, args)
    print(f"Server: {name} ({mid})")
    users = select_users(shared_users(api, mid), args)
    apply_level(api, mid, users, args.level, args)


def cmd_disable(api, args):
    name, mid = resolve_server(api, args)
    print(f"Server: {name} ({mid})")
    users = select_users(shared_users(api, mid), args)
    apply_level(api, mid, users, 0, args)


def cmd_sync(api, args):
    """Loop forever: anyone shared on the server gets allowTuners=level."""
    name, mid = resolve_server(api, args)
    print(f"Server: {name} ({mid}); re-checking every {args.interval}s. Ctrl-C to stop.")
    args.all = True
    while True:
        try:
            users = select_users(shared_users(api, mid), args)
            todo = [u for u in users if u["allowTuners"] != args.level]
            if todo:
                print(time.strftime("%Y-%m-%d %H:%M:%S"), f"{len(todo)} user(s) need updating")
                apply_level(api, mid, todo, args.level, args)
            elif args.verbose:
                print(time.strftime("%Y-%m-%d %H:%M:%S"), "all shared users already set")
        except Exception as exc:  # keep the loop alive across transient plex.tv errors
            print(time.strftime("%Y-%m-%d %H:%M:%S"), f"error: {exc}")
        if args.once:
            return
        time.sleep(args.interval)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0],
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--token", default=os.environ.get("PLEX_TOKEN"),
                   help="plex.tv token of the server OWNER (or set PLEX_TOKEN)")
    p.add_argument("--server", help="owned server name (only needed if you own several)")
    p.add_argument("--machine-id", help="owned server machineIdentifier (alternative to --server)")
    p.add_argument("--base-url", default=PLEX_TV, help=argparse.SUPPRESS)
    p.add_argument("--dry-run", action="store_true", help="print the write calls instead of sending them")
    p.add_argument("-v", "--verbose", action="store_true", help="print every HTTP call")

    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list", help="show everyone shared on the server and their Live TV flag")

    def add_target_args(sp, with_level=True):
        sp.add_argument("--user", action="append", help="username, email, title or id (repeatable)")
        sp.add_argument("--all", action="store_true", help="every non-pending user shared on the server")
        sp.add_argument("--include-home", action="store_true", help="also touch Plex Home members")
        sp.add_argument("--force", action="store_true", help="resend even if plex.tv already reports the value")
        if with_level:
            sp.add_argument("--level", type=int, choices=(1, 2), default=1,
                            help="1 = Live TV (default), 2 = Live TV + DVR")

    add_target_args(sub.add_parser("enable", help="grant Live TV"))
    add_target_args(sub.add_parser("disable", help="revoke Live TV"), with_level=False)
    sp = sub.add_parser("sync", help="keep Live TV enabled for everyone shared on the server (daemon loop)")
    sp.add_argument("--interval", type=int, default=300, help="seconds between checks (default 300)")
    sp.add_argument("--include-home", action="store_true", help="also touch Plex Home members")
    sp.add_argument("--force", action="store_true", help=argparse.SUPPRESS)
    sp.add_argument("--once", action="store_true", help="run a single pass and exit")
    sp.add_argument("--level", type=int, choices=(1, 2), default=1, help="1 = Live TV (default), 2 = Live TV + DVR")

    args = p.parse_args(argv)
    if not args.token:
        sys.exit("A plex.tv token is required: --token or PLEX_TOKEN.")
    api = PlexTV(args.token, base_url=args.base_url, dry_run=args.dry_run, verbose=args.verbose)
    {"list": cmd_list, "enable": cmd_enable, "disable": cmd_disable, "sync": cmd_sync}[args.cmd](api, args)


if __name__ == "__main__":
    main()
