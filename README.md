# PD2 Filter Forge

A desktop editor for Project Diablo 2 loot filters. Build a filter from scratch or start from any public filter in the PD2 launcher, edit it visually, test it against any item, and install it into the game.

## Download

Get the latest Windows build from [Releases](https://github.com/RoofooEvazan/pd2-filter-forge/releases/latest):

- `PD2-Filter-Forge_x.y.z_x64-setup.exe` installs the app (Start menu entry, uninstaller).
- `PD2-Filter-Forge_x.y.z_portable.exe` runs without installing.

The app checks GitHub for a newer release when it starts (at most every 6 hours) and shows a banner with the release notes and a download link. Settings → Version checks on demand. What changed in each version is in [CHANGELOG.md](CHANGELOG.md).

## Two modes

Switch with the **Simple | Advanced** toggle in the top bar.

- **Simple** is for players who never want to read filter code. Pick a kind of item (Runes, Currency, Uniques, Charms, Runeword bases, Potions, Gold…) or search any item by name. Each one is shown exactly as your filter draws it at the chosen strictness level. Click one and choose:
  - show it, hide it on stricter levels, or hide it,
  - a text color, *** stars ***, or a custom name,
  - a minimap icon (size and color) and a drop sound, played from PD2's own sound files.

  It works on any filter. Choices are saved as a clearly labeled "Simple mode choices" block at the top of the file, so they win over the rest of the filter and stay readable in Advanced mode. An alert-only choice keeps the filter's own look. The Loot preview page shows a pile of typical drops.
  - **Mystery drops:** make your own "Little/Lucky Bastard"-style banners (words, colors, decorations, icon, sound) that hide chosen items on the ground until you pick them up. Every item can opt in, and each mystery lists its items in the sidebar.
- **Shop hunting** (both modes): pick what you're hunting for in vendor windows from class-aware suggestions or build your own (item type, quality, skill trees, class skills, single skills, stats, sockets). Give each a loud look, then check it in a mock vendor tab where hovering shows the exact tooltip.
- **Advanced** is the full editor described below. Rule rows read in plain words by default, with a Words/Code toggle.


- **Start anywhere**: a commented starter filter, a blank filter, any `.filter` on disk, the filters in your `ProjectD2\filters` folder, or any public filter from the launcher list (`Project-Diablo-2/LootFilters/filters.json`). Public and launcher-downloaded filters open as your own copy, so the original keeps auto-updating.
- **Lossless**: untouched lines are written back byte-for-byte; only lines you edit are re-serialised. Tested on 13 real filters (up to 8,890 rules).
- **Rule list** with a live in-game preview of every rule, section outline (banner headers and `// Title` sub-sections), search by text, code *or item name* ("shako" finds `uap` rules), and filters for problems, notifications, hides, disabled rules and rules matching the test item.
- **Inspector** for the selected rule:
  - a plain-English explanation ("When: elite unique helms · Then: gold name, large icon"),
  - a visual condition builder (ALL/ANY groups, NOT, operators, ranges) plus a text mode with autocomplete,
  - an output editor with color swatches, value keywords, description, minimap icon size and color (real 256-color PD2 palette), map lines, drop sounds, notification tier and `%CONTINUE%`,
  - "Line N wins first" when an earlier rule overrides it.
- **New rule wizard**: highlight items, hide junk from a chosen filter level, add info tags, or start blank.
- **Test Lab**: build any item (base, unique, set, runeword, quality, eth, sockets, ilvl, stats, skills, affixes), set class, level, difficulty, zone, location and filter level, and see the exact rule chain, the final label and tooltip, and the notification. Includes a loot-pile preview with notification list and minimap.
- **Problems**: about 85 checks built on a line-by-line port of PD2's condition parser (`src/lib/bh.ts`), so they report what the game will actually do.
  - Results are grouped by impact: never works, matches too much, works differently than it reads, shows the wrong text, tidy-up.
  - Each finding is a row: the problem on the left, the suggestion and fix on the right. Expanding it shows what PD2 does with that exact text, a before/after of every fix, and the reference section behind it.
  - Fixes are marked *certain* (same meaning, written so PD2 reads it) or *suggestion* (a guess at what you meant). "Fix all" applies only certain fixes. Alias moves are checked against every other alias before they're called certain.
  - An optional deep check runs example items through the whole filter to find overridden rules, notifications that never fire, and wiped descriptions.
- **Levels, Aliases & Formulas** managers. Formulas are evaluated live against the test item.
- **Codex**: every condition and output keyword, item code, stat, skill, zone, color, palette entry, sound and formula function. It shows how often each is used in *your* filter, jumps to the uses, and inserts into the selected rule.
- **Source view** with highlighting, and an "edit as text" mode.
- **Undo/redo** in both modes, draft autosave with resume, **Ctrl+K** command palette, keyboard navigation, three themes, accent color, density and text size.
- **Install to PD2** saves to `ProjectD2\filters\local` (with a `.bak` of the previous version) in UTF-8, which PD2 reads since Season 13 (ANSI is still available).

## Engine reference

[docs/PD2-Filter-Engine-Reference.md](docs/PD2-Filter-Engine-Reference.md) documents how PD2 actually loads, parses and applies filters. It's based on BH's source (commit `662229b6`), the launcher source, the game data and the community filters, and is cited line by line.

The same document is built into the app (Codex → Engine reference), and every Problems check links to its section.

`src/lib/bh.test.ts` pins each documented behaviour to a golden test, including one that fails if a check points at a missing section.

## Up-to-date language support

The language model follows the PD2 wiki *and* PD2's own filter engine source ([Project-Diablo-2/BH](https://github.com/Project-Diablo-2/BH), `ItemDisplay.cpp`). This covers Formulas (`Formula[KEY]:`, `$f(...)`), `%CL%`/`%CS%`, `CRAFTALVL`/`REROLLALVL`, `MAPTIER`, corrupted hero ears, and engine-only keywords that aren't on the wiki yet: `%LINE-xx%`, `%LBRACE%`/`%RBRACE%`/`%PERCENT%`, the `*_TRANS` transparency codes, `GOODSK`/`GOODTBSK` and `REPQUANT`.

The evaluator reproduces the engine's quirks:

- AND and OR have **equal precedence and are read left to right**.
- Aliases are substring replacements.
- Unknown tokens are dropped.
- A value code without a comparison never matches.
- `GOLD`/`RUNE`/`GEM*` only apply to their own item kind, and `MAPTIER` is −1 on non-maps.
- Notifications are decided in a separate pass.

## Running

```bash
npm install
npm run desktop        # desktop app in dev mode (Tauri)
npm run dev            # browser-only at http://localhost:1427 (open/save via file pickers)
npm test               # engine tests, including round-trips of the filters in your PD2 folder
```

Build the Windows installer:

```bash
npm run desktop:build
```

If the project lives under a virtualized Windows path (like the Claude app's scratch folder), set `CARGO_TARGET_DIR` to a normal folder first, because the MSVC linker can't write there.

## Releasing

1. Bump the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
2. Add the release notes to the top of `CHANGELOG.md`.
3. Build (`npm run desktop:build`), then tag and publish a GitHub release named `vX.Y.Z` with those notes, attaching the installer and the portable exe (named `PD2-Filter-Forge_X.Y.Z_x64-setup.exe` and `PD2-Filter-Forge_X.Y.Z_portable.exe`, which is what the update check looks for).

## Game data

`src/data/pd2data.json` is generated from the live `pd2data.mpq` tables (bases, uniques, sets, runewords, stats, skills, zones, affixes, sounds), the Act 1 palette and the PD2 wiki. After a PD2 patch, re-extract the tables (pd2-planner's `tools/extract.py` writes them) and run:

```bash
npm run data -- --tables path/to/tables
```

## Limits of the simulator

Previews are close but not the game itself:

- Vendor prices, `BASEMIN/MAXKICK/SMITE`, `UP*` requirements and `GOODSK` aren't computed. Set a price in the Test Lab when a rule depends on it.
- `ALVL` ignores the base's "magic level" bonus (wands, staves, orbs and circlets).
- Rule-list previews use a sample item built from each rule's own conditions. The Test Lab runs the whole filter.

## Layout

- `src/lib/`: the language and engine. `spec` (keywords), `document` (lossless parser), `conditions` (tokenizer, BH precedence, evaluator), `formula`, `output` (segments, effects, rendering), `engine` (whole-filter run), `lint`, `explain`, `sample`, `item`, `data`, `launcher`, `platform`, `templates`.
- `src/components/`: the UI.
- `src-tauri/`: the Rust shell. It finds the ProjectD2 folder via the registry and common paths, lists directories, and reads and writes files with an atomic write plus `.bak`.
