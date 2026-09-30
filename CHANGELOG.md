# Changelog

## 0.2.0 — 2026-09-30

First public release.

### Update checks

- The app checks GitHub for a newer release on launch (at most every 6 hours) and shows a banner with a download link.
- **Settings → Version** shows the running version, checks on demand, and displays the latest release notes.

### Problems tab, redesigned

- Each finding is now a row: **the problem on the left, the suggestion and fix on the right**.
- Click a row to expand it. You see what PD2 does with that exact text, a before/after preview of every fix, and a link to the engine-reference section behind it.
- Fixes are labelled **certain** (same meaning, written so PD2 reads it) or **suggestion** (a guess at what you meant). "Fix all" only ever applies certain fixes.

### More accurate checks

- **Aliases that expand too late.** An alias used inside a later alias, like `FL9_MARKER_OK` inside `OSSET1`, used to be reported as an unknown word, with the word itself suggested as the fix. It's now explained correctly: PD2 expands each alias once, top to bottom. You get two possible moves, and each is checked against every other alias. A move that would break another alias (for example `TOWN` inside `FL9_MARKER_OK`) says so and isn't marked certain.
- **`ASNTREE 13`** is reported as a stray space in `ASNTREE13`, with a one-click fix.
- **Item-code typos** rank codes from the same family first (`aqv OR aq2` suggests `aqv2`). A number that lost its prefix (`SK263>0 OR 264>0`) suggests `SK264`.
- **`SOCK=1~2`** is explained as `SOCK=1`, with `SOCK~1-2` offered.
- **Comparisons on yes/no conditions:** `ETH=0` still means ETH, with `!ETH` offered as the fix. `FOOLS>0` is the same as `FOOLS`.
- **`+` sums with unsupported parts** get one message per sum, with a checked fix that turns it into a `$f(…)` formula.
- **Literal `%` in text:** `10%pdr` gets a `%PERCENT%` fix, and a stray `%Tombsong` gets "remove the stray %". No more `%td%` → `%ED%` guesses.
- **Line breaks in names** are only flagged when the rule can match plain normal items. Items with skills are allowed their first line break, as in PD2.
- **Rune-only output** (`%RUNENAME%`) is no longer flagged on rules that only match runes, including `RUNE=3 OR RUNE=5`.
- **Clearer messages** for `RES`, `FILTLVL` beyond the last level, duplicate rules, `%TIER%` without an icon or sound, and `%NOTIFY%`. Rules that never match now name the parts PD2 dropped.

### Other

- Drop-sound previews in Simple mode now play PD2's own sound files straight from your install (`ProjectD2\data\global\sfx\pd2\dropsounds`), so they're no longer bundled with the app.

## 0.1.0 — 2026-09-29

Initial build (not published).

- **Simple mode:** pick items visually and choose show/hide, color, name, minimap icon and sound, with no filter code involved.
- **Advanced mode:**
  - a lossless editor with a rule list and an inspector (visual condition builder and output editor);
  - a Test Lab and loot preview;
  - managers for levels, aliases and formulas;
  - the Codex, a source view, and a command palette.
- **Engine:** a faithful port of PD2's filter engine (BH), documented in `docs/PD2-Filter-Engine-Reference.md`, with about 85 checks built on it.
- **Opening and installing:** open any launcher filter as your own copy, and install it into `ProjectD2\filters\local` with a backup.
