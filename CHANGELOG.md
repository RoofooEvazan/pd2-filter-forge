# Changelog

## 0.3.4 — 2026-09-30

### How-to guide and website

- **New How-to guide tab** (Simple tabs, the ? in the rail, and the start screen) covers Simple and Advanced mode with screenshots and animations. It's searchable.
- **Website:** the same guide plus a download page, at https://roofooevazan.github.io/pd2-filter-forge/.

### Shop hunting, re-laid out

- **Page:** targets on the left and the editor across the rest of the page. The tooltip preview sits on top, then **1. What to look for** and **2. How it looks** side by side.
- **Vendor preview** is its own tab, and suggestions open from **Add a target**.
- **New in the editor:** a "Hunting / Paused" switch, **Duplicate**, and (Advanced mode) the exact filter rule it writes.

### Real names on unidentified items

- **What it does:** uniques and set items with only one possibility show their real name before identifying ("Harlequin Crest" instead of "Shako"). Items that could be several keep their name, and the tooltip lists what they could be.
- **Options:** uniques, sets, the possibilities list, and keeping the base type. Live examples use your filter.
- **Where:** Simple mode (Uniques / Set items) and Advanced mode (Levels, Aliases, Formulas & Features).

### Themes

- **Five new themes:** Graphite, Nord, Ember, Verdant and Snow, for eight in total.
- **Make your own** from five colors with a live preview. Edit, delete, or share it as a code others can paste in.

### Navigation

- **Back and forward:** the mouse's back/forward buttons (and Alt+← / Alt+→) move between screens, like in a browser.

### Fixes

- **Problems → Remove:** removing a word from a list (like a dead item code) now also removes the OR/AND next to it. Leaving it would have made PD2 disable the rule.
- **Fix preview:** the before/after highlights whole words.
- **Managed blocks** (unidentified names, shop hunting, Simple choices) are placed above the section header of the first rule, instead of inside it.

## 0.3.3 — 2026-09-30

### Easier to find

- **Simple mode has labeled tabs** across the top: Items · Mystery drops · Loot preview · Shop hunting. New features carry a NEW badge until you open them.
- **Mystery drops has its own tab**, with a short how-it-works guide next to the starting points.
- **Advanced mode:** the Shop hunting icon shows a dot until you've visited it.

### More accurate problem checks (from a review of the Roofoo filters)

- **Unknown item codes no longer suggest items of a different kind.** In a list of PvP arena maps, `t60` or `t63` used to suggest real maps like `t13` or `t24`, which would have given those maps the PvP note. Now the checker suggests removing the dead code.
- **The comment above a rule is used as a hint:** under “// Hide rare Heavy Bolts”, `cqv1` is recognised as a leftover, because Heavy Bolts (`cqv2`) is already in the list. It no longer suggests `cqv` (Light Bolts).
- **New check, "Item code that doesn't fit the list":** flags a real item of a different kind hiding among others, like `t69` (Ruined Cistern Map, tier 3) in the PvP arena list.
- **Built-in colors:** no longer flagged when the color you set is the item's own color (`%GOLD%` on Orb of Fortification changes nothing).
- **Unused aliases** are found correctly. `NOSTARUNIQUE` was counted as used just because `NOSTARUNIQUEETH` contains it. An alias is now used only if a rule, or an alias that a rule uses, names it as a whole word.
- **Alias order** isn't reported for aliases no rule uses, since it makes no difference there.

## 0.3.2 — 2026-09-30

- **Updates install themselves.** "Update to x.y.z" (banner, Settings → Version and the start screen) downloads the new installer from GitHub, closes Filter Forge, updates it in place and reopens it. Only installers from this app's own GitHub releases are accepted.
- **Fixed: links and download buttons did nothing.** The app wasn't allowed to open web links, so the update buttons, "All releases", "Open #filter-help" / "Open #share-your-filter" and the reference links were all blocked without an error. They open in your browser now, and if a link can't be opened you get a message and the link is copied for you.

## 0.3.1 — 2026-09-30

- **Post to the Roofoo Discord:** a Discord button (top bar, Problems tab and Ctrl+K) fills in the pinned prompt for **#filter-help** or **#share-your-filter** with everything Filter Forge already knows: your filter, base filter, filter level, app version, what you changed (item styles, mystery drops, shop targets) and a problem summary. Copy the post, save the files to attach (your .filter, plus the problems report for help posts), and open the channel in one click. It posts from your own Discord account; nothing is sent automatically.
- **Problems → Copy for AI:** a plain-text report of every problem, with its line, what PD2 does, the suggestion and a preview of each fix. It starts with a short primer on how PD2 reads filters, so you can paste it straight into an AI assistant. Copy it to the clipboard or save it as a .txt; you can limit it to what's currently shown and include or leave out tidy-ups.
- The start screen shows the app version with a **Check for updates** button, and the command palette (Ctrl+K) has a "Check for updates" command. The Settings rail button now reads "Settings & updates".

## 0.3.0 — 2026-09-30

### Shop hunting

- A new **Shop hunting** page (in both Simple and Advanced mode) for vendor windows.
- **Suggestions for your class:** +3 to each skill tree, +2 class skills, caster weapons with FCR, +2 skill circlets with run speed, 4+ socket runeword bases, fast boots, superior armor and +all skills. Each comes with its own contrasting look.
- **Fully customizable targets:**
  - what to look for (item type and quality);
  - any mix of requirements (skill tree, class skills, a single skill, FCR/IAS/FRW/FHR/ED/resists/MF/+skills/attributes, sockets);
  - how it looks: Spotlight, Price tag, Stat readout, Alarm or plain color, with name and accent colors, a line showing the values you're hunting (e.g. "+3 Lightning · 20 FCR"), a tooltip note, and a price color.
- **Vendor preview:** a mock vendor tab stocked with samples of your targets plus ordinary items.
  - Hover any item to see its tooltip exactly as your filter labels it.
  - Optionally mark every match, or show all tooltips side by side.
- **"Gray out everything else in shops"** makes your targets pop.
- Shop rules live in their own block above everything else, so they always win in vendor windows. More specific targets are checked first.

### Mystery drops (Simple mode)

- Create your own mystery banners, like Little, Lucky and Big Bastard. On the ground, chosen items hide behind the banner with its own minimap icon and drop sound, and you only see what dropped once you pick it up.
- **Fully customizable:**
  - banner words, each in its own color;
  - spread-out letters, and decorations on both sides (character, count, spacing, color);
  - icon and sound;
  - whether the item shows normally when dropped in town or already identified.
  - A live character counter warns before PD2's 56-character limit.
- **Starting points:** Little Bastard, Lucky Bastard, Holy Moly, Mystery Box and Jackpot.
- **Per item:** every item's panel has a **Mystery drop** choice, and shows how the item looks once picked up.
- **Sidebar:** each mystery has its own entry listing every item hidden behind it.

### Fixes

- **Problems:** the rule text now wraps, so the whole line can be read.
- **Rune choices in Simple mode** now also match stacked runes (`r30s`), the way runes usually drop.

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
