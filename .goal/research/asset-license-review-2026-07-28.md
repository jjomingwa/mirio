# Asset-license evidence review

Checked: 2026-07-28

Status: `NEEDS_HUMAN_REVIEW`. This record organizes source evidence; it is not legal advice
and does not approve any package for release.

## Evidence confirmed from current source pages

- **Chiptune: Exploration** — OpenGameArt identifies the author as Ansimuz, the license as
  CC0, commercial use as allowed, and attribution as optional.
  Source: https://opengameart.org/content/chiptune-exploration
- **Going Up - adventure Chiptune** — OpenGameArt identifies the author as Ansimuz and the
  license as CC0, with optional attribution.
  Source: https://opengameart.org/content/going-up-adventure-chiptune
- **Sound effects for platformer** — OpenGameArt identifies the author as Listener, the
  license as CC0, and the archive as 19 sounds.
  Source: https://opengameart.org/content/sound-effects-for-platformer
- **Sideview Fantasy Patreon Collection** — OpenGameArt identifies the author as Ansimuz,
  the collection as CC0, and explicitly lists the `Grotto-escape-2-boss-dragon` and
  `sunny-dragon` sprite folders used by this game.
  Source: https://opengameart.org/content/sideview-fantasy-patreon-collection

## Local evidence and unresolved conflicts

- `public/assets/licenses/sunnyland/public-license.txt` requires credit for music by Pascal
  Belisle. The in-game credits now include that credit.
- `public/assets/licenses/going-up/public-license.txt` describes artwork and does not identify
  the Going Up music file. It is not treated as governing proof for that track.
- `public/assets/fantasy/Sprites/Grotto-escape-2-boss-dragon/patreon-license.txt` contains an
  older Patreon-only condition. The later OpenGameArt page labels the named collection and
  folder CC0, but a qualified reviewer must confirm that the shipped file hashes belong to
  the later archive or require replacement.
- Exploration, Going Up, and the platformer SFX still need preserved local copies or dated
  source snapshots of their governing CC0 records.
- `.goal/asset-inventory.json` records the current path, package mapping, byte size, and
  SHA-256 for every shipped file. Regenerate with `npm run inventory:assets` and verify with
  `npm run audit:assets`.

No `.goal/assets.json` entry may become `APPROVED` solely from this agent-authored summary.
