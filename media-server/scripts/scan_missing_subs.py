#!/usr/bin/env python3
"""Scan a Plex library for non-English content that has no English subtitles.

Finds every movie/episode whose audio has no English track AND no English
subtitle stream (embedded or sidecar) — i.e. the stuff a viewer can't follow.

Usage:
    PLEX_URL=http://localhost:32400 PLEX_TOKEN=xxxx python3 scan_missing_subs.py
    python3 scan_missing_subs.py --deep        # check every episode, not a sample
    python3 scan_missing_subs.py --csv out.csv

By default TV shows are sampled (first episode of each season) to keep the
scan fast; releases are usually consistent within a season. Use --deep for
the full episode-by-episode pass.

Only needs the Python standard library. Get your Plex token: play anything in
Plex Web, click the "..." menu > Get Info > View XML, and copy the value of
X-Plex-Token from that page's URL.
"""

import argparse
import csv
import json
import os
import sys
import urllib.parse
import urllib.request

ENGLISH = {"en", "eng", "english"}


def api(base, token, path, **params):
    params["X-Plex-Token"] = token
    url = f"{base}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def stream_langs(item):
    """Return (audio_langs, sub_langs, has_unknown_audio) for one metadata item."""
    audio, subs, unknown = set(), set(), False
    for media in item.get("Media", []):
        for part in media.get("Part", []):
            for stream in part.get("Stream", []):
                lang = (stream.get("languageCode") or "").lower()
                if stream.get("streamType") == 2:
                    if lang:
                        audio.add(lang)
                    else:
                        unknown = True
                elif stream.get("streamType") == 3 and lang:
                    subs.add(lang)
    return audio, subs, unknown


def fetch_item(base, token, rating_key):
    data = api(base, token, f"/library/metadata/{rating_key}")
    return data["MediaContainer"]["Metadata"][0]


def check(base, token, rating_key, title):
    audio, subs, unknown = stream_langs(fetch_item(base, token, rating_key))
    if audio & ENGLISH or subs & ENGLISH:
        return None
    return {
        "title": title,
        "audio": ",".join(sorted(audio)) or ("unknown" if unknown else "none"),
        "subs": ",".join(sorted(subs)) or "none",
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--deep", action="store_true", help="scan every episode")
    ap.add_argument("--csv", metavar="FILE", help="also write results to a CSV file")
    args = ap.parse_args()

    base = os.environ.get("PLEX_URL", "http://localhost:32400").rstrip("/")
    token = os.environ.get("PLEX_TOKEN")
    if not token:
        sys.exit("Set PLEX_TOKEN (and PLEX_URL if Plex isn't on this machine).")

    flagged = []
    sections = api(base, token, "/library/sections")["MediaContainer"].get("Directory", [])
    for section in sections:
        stype, key, name = section.get("type"), section["key"], section.get("title", "?")
        if stype == "movie":
            print(f"Scanning movie library: {name} ...")
            movies = api(base, token, f"/library/sections/{key}/all", type=1)
            for m in movies["MediaContainer"].get("Metadata", []):
                hit = check(base, token, m["ratingKey"], m.get("title", "?"))
                if hit:
                    flagged.append({"library": name, **hit})
        elif stype == "show":
            mode = "every episode" if args.deep else "one episode per season"
            print(f"Scanning TV library: {name} ({mode}) ...")
            shows = api(base, token, f"/library/sections/{key}/all", type=2)
            for show in shows["MediaContainer"].get("Metadata", []):
                stitle = show.get("title", "?")
                leaves = api(base, token, f"/library/metadata/{show['ratingKey']}/allLeaves")
                episodes = leaves["MediaContainer"].get("Metadata", [])
                if not args.deep:
                    seen, sample = set(), []
                    for ep in episodes:
                        season = ep.get("parentIndex")
                        if season not in seen:
                            seen.add(season)
                            sample.append(ep)
                    episodes = sample
                for ep in episodes:
                    label = (f"{stitle} S{ep.get('parentIndex', 0):02}"
                             f"E{ep.get('index', 0):02} {ep.get('title', '')}".strip())
                    hit = check(base, token, ep["ratingKey"], label)
                    if hit:
                        flagged.append({"library": name, **hit})

    print()
    if not flagged:
        print("All good — everything either has English audio or English subtitles.")
        return
    print(f"{len(flagged)} item(s) have non-English audio and NO English subtitles:\n")
    for f in flagged:
        print(f"  [{f['library']}] {f['title']}  (audio: {f['audio']}, subs: {f['subs']})")
    print("\nFix: point Bazarr at these — see media-server/MEDIA_SETUP.md.")

    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=["library", "title", "audio", "subs"])
            writer.writeheader()
            writer.writerows(flagged)
        print(f"CSV written to {args.csv}")


if __name__ == "__main__":
    main()
