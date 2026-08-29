# Media Server Add-ons: Subtitles (Bazarr) + Quality Sync (Recyclarr)

Everything in this folder runs next to your existing Plex + Radarr (+ Sonarr)
stack on Docker Desktop. Two jobs:

1. **Bazarr** — makes sure non-English movies and shows (Sailor Moon, etc.)
   always have English subtitles, automatically, forever.
2. **Recyclarr** — keeps Radarr/Sonarr synced to the TRaSH Guides quality
   formats, tuned so audio upgrades prefer **DD+ Atmos → DD+ → lossless**
   (best sound that still direct-plays when people stream from your server).

There's also `scripts/scan_missing_subs.py` — a one-shot report of exactly
which titles have non-English audio and no English subs, so you can fix the
TV-guide shows first.

---

## Start here

```
cd media-server
copy .env.example .env        # (cp on macOS/Linux)
# edit .env: media folder paths + Radarr/Sonarr API keys
docker compose up -d bazarr
```

API keys: Radarr/Sonarr → Settings → General → API Key.

`up -d bazarr` starts only Bazarr (subtitles). When you're ready for the
quality/audio sync later, start the other service with
`docker compose up -d recyclarr` — nothing runs until you do.

---

## Part 1 — Subtitles with Bazarr (do this first)

Open http://localhost:6767 after the container starts.

**1. Connect Sonarr and Radarr** (Settings → Sonarr / Radarr):
address `host.docker.internal`, ports `8989` / `7878`, paste the API keys.

**2. Add subtitle providers** (Settings → Providers):
- **OpenSubtitles.com** — make a free account at opensubtitles.com first.
  Free tier = 20 downloads/day, which is fine once the backlog is cleared.
- **Embedded Subtitles** — important for anime: lots of releases (Sailor Moon
  fansubs especially) already carry subs inside the file. This provider lets
  Bazarr detect and use them instead of downloading duplicates.
- Optionally add Gestdown and Subf2m for extra TV coverage.

**3. Create the language profile** (Settings → Languages):
- Add English to the languages list.
- Create a profile named e.g. **"English subs"** with one item: `English`.
- On that item, tick **"Exclude Audio"** (skip subs when the audio is already
  English). Untick it instead if you want subs available on *everything*.
- Set this profile as the **default for both Series and Movies** so every
  current and future item gets it.

**4. Let it scan, then clear the backlog:**
- Bazarr indexes both libraries, then fills the **Wanted** page with every
  item missing subs under the profile.
- **TV-guide shows first:** open each show under Series (Sailor Moon, etc.)
  and hit **Search All** on its page — that jumps the queue for that show.
- Then Wanted → **Search All** to work through the rest (the free
  OpenSubtitles quota clears big backlogs over a few days; embedded subs
  don't count against it).

**5. Plex side:** subtitles land as `.srt` files next to the videos; Plex
picks them up on its normal library scan. In Plex → Settings → your account →
subtitle language English, and they'll be selected automatically where needed.

## Part 2 — Audit scan: what's missing right now

Run the report anytime (from this folder, on the media machine):

```
set PLEX_TOKEN=xxxx              (export PLEX_TOKEN=xxxx on macOS/Linux)
python3 scripts/scan_missing_subs.py --csv missing_subs.csv
```

Token: play anything in Plex Web → "..." → Get Info → View XML → copy
`X-Plex-Token` from that page's URL.

It lists every movie/episode with **no English audio and no English subs**
(TV sampled one episode per season; add `--deep` for every episode). Re-run
after Bazarr's first pass to confirm the list hits zero.

## Part 3 — Quality/audio sync with Recyclarr

The `recyclarr` container syncs `recyclarr/recyclarr.yml` daily. What it sets:

- **Radarr:** TRaSH "HD Bluray + WEB" 1080p profile — upgrades toward quality
  Blurays/WEB-DLs, never 4K, junk releases blocked.
- **Sonarr:** TRaSH "WEB-1080p" profile — ideal for TV since streaming-first
  shows ship DD+/DD+ Atmos natively.
- **Audio scores (both):** DD+ Atmos (500) > DD+ (400) > TrueHD Atmos (300) >
  DTS:X (250) > TrueHD/DTS-HD MA (200) > the rest. Radarr/Sonarr will now
  automatically swap files for better-audio versions as they appear.
- Nothing penalizes non-English audio — Japanese Sailor Moon stays Japanese;
  Bazarr handles the subs.

Run the first sync now instead of waiting for the schedule:

```
docker compose exec recyclarr recyclarr sync
```

Then check Radarr → Settings → Custom Formats to see the imported formats,
and make sure your movies/shows actually use the **HD Bluray + WEB** /
**WEB-1080p** profiles (Movies → select all → Edit → Quality Profile).

## Part 4 — Shuffling the TV-guide lineup (ErsatzTV)

The lineup repeats because the schedule items are set to a fixed playback
order — the playout just replays the same sequence. Fix it in the schedule,
not the channel:

1. Open ErsatzTV → **Schedules** → click the schedule your channel uses →
   edit each **schedule item** (the rows pointing at your
   collections/shows).
2. Change **Playback Order** on each item:
   - **Shuffle** — full random across everything in the item, no repeats
     until the whole pool has played once. Best for movie collections.
   - **Shuffle In Order** — the good one for shows: picks *shows* in random
     order but plays each show's *episodes* in sequence. Sailor Moon still
     progresses episode 1 → 2 → 3, it just isn't always in the same slot
     between the other shows. Use this for the TV-guide channel.
   - (Chronological = the fixed order you're seeing now.)
3. Save, then go to **Playouts** → your channel → **Reset Playout**. That
   throws away the old fixed lineup and rebuilds the guide with the new
   shuffle immediately.

From then on it keeps generating forward on its own — restarts continue the
playout where it left off instead of replaying the same lineup, and every
cycle through the pool gets a fresh shuffle. No manual rebuilding again.

Tip: if one schedule item mixes shows and movies, split them into two items
("Shuffle In Order" for the shows, "Shuffle" for the movies) so episodes
stay in sequence while the movies stay random.
