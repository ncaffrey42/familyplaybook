# plex-livetv-share

Grant Live TV (and optionally DVR) to the people your Plex Media Server is
shared with, including friends who are **not** in your Plex Home.

## Why this is a script and not a server patch

Plex Media Server is closed source, so there is no server code to comment in.
Live TV is also not a library: you cannot share it the way you share a Movies
folder. It is a per-user permission stored on plex.tv, an integer called
`allowTuners`:

| value | meaning        |
|-------|----------------|
| 0     | no Live TV     |
| 1     | Live TV        |
| 2     | Live TV + DVR  |

Plex Web only shows the "Allow Live TV" switch for Plex Home members. The
plex.tv sharing API, however, takes `allowTuners` for any shared user. This
script sets that flag through the same two calls Plex Web and the open-source
client libraries use:

1. `PUT https://plex.tv/api/v2/sharings/{userId}?allowTuners=N`
2. `POST https://plex.tv/api/v2/shared_servers/{shareId}` with
   `{"machineIdentifier", "librarySectionIds", "settings": {"allowTuners": "N"}}`

It then re-reads `https://plex.tv/api/users` and prints what plex.tv actually
stored, so you can tell immediately whether Plex accepted it for a given
account.

## Requirements

* Python 3.8 or newer. No pip packages.
* The plex.tv token of the **server owner**. See
  <https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/>.
* The server owner needs the Plex Pass that Live TV already requires.

## Usage

```bash
export PLEX_TOKEN=xxxxxxxxxxxxxxxxxxxx

# Who is shared on the server, and what their Live TV flag is right now
./plex_livetv_share.py list

# See exactly what would be sent, without sending it
./plex_livetv_share.py --dry-run enable --all

# Live TV for everyone shared on the server (Home members are left alone)
./plex_livetv_share.py enable --all

# Live TV + DVR for one friend, by username, email, display name or id
./plex_livetv_share.py enable --user bob --level 2

# Take it away again
./plex_livetv_share.py disable --user bob

# Keep it applied: re-check every 10 minutes and fix anyone who lost the flag
# or was newly invited. This is the "runs beside the server" mode.
./plex_livetv_share.py sync --interval 600
```

If your token owns more than one server, add `--server "Living Room"` or
`--machine-id <id>` before the command.

## Running it beside Plex Media Server

### systemd (Linux)

```ini
# /etc/systemd/system/plex-livetv-share.service
[Unit]
Description=Keep Live TV enabled for shared Plex users
After=network-online.target

[Service]
Environment=PLEX_TOKEN=xxxxxxxxxxxxxxxxxxxx
ExecStart=/usr/bin/python3 /opt/plex-livetv-share/plex_livetv_share.py sync --interval 600
Restart=always
RestartSec=30
User=plex

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now plex-livetv-share
journalctl -u plex-livetv-share -f
```

### Docker Compose (next to a Plex container)

```yaml
services:
  plex-livetv-share:
    image: python:3.12-alpine
    restart: unless-stopped
    environment:
      PLEX_TOKEN: xxxxxxxxxxxxxxxxxxxx
    volumes:
      - ./plex_livetv_share.py:/app/plex_livetv_share.py:ro
    command: python /app/plex_livetv_share.py sync --interval 600
```

### Windows

Run `python plex_livetv_share.py sync --interval 600` from Task Scheduler with
"Run whether user is logged on or not", or run `enable --all` once from a
PowerShell window after each time you invite someone.

## What to expect

* The read-back line after each change is the source of truth. `OK` means
  plex.tv now reports the flag for that user. `!!` means plex.tv accepted the
  request but kept the old value, which is Plex enforcing the Home-only rule
  server-side for that account. There is no further client-side switch to
  flip in that case.
* The friend must be using a Plex app that shows Live TV for shared servers
  and, since late 2025, remote streaming from your server requires either
  your Plex Pass or their Remote Watch Pass.
* Live TV is never listed as a library. Once the flag is set, it shows up
  for the friend under Live TV & DVR in the sidebar, not as a folder.
