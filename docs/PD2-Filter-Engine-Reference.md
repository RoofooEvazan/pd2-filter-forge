# PD2 Loot Filter Engine Reference

How Project Diablo 2 actually reads and applies a loot filter. This is based on the filter engine's source code, not the wiki.

- **Engine:** [Project-Diablo-2/BH](https://github.com/Project-Diablo-2/BH), commit `662229b6` (2026-07-14).
- **Launcher:** [PD2Launcher](https://github.com/Project-Diablo-2/PD2Launcher), commit `48e8cb3` (2026-07-23).
- **Game data:** the live `pd2data.mpq`, modified 2026-05-13 (Season 13).
- **Written:** 2026-09-28.

Citations look like `ItemDisplay.cpp:3844`. All files are under `BH/`, and the ItemDisplay/Item files are in `BH/Modules/Item/`. Tags:

- **[verify]** means the behaviour follows from the code but hasn't been confirmed in game.
- **[wiki ✗]** means the wiki says something different.

Every check on Filter Forge's Problems page links to a section of this document.

---

## Contents

1. [The 25 things that matter most](#top-25)
2. [How the launcher and game pick the file](#file-loading)
3. [Line syntax](#line-syntax)
4. [Aliases](#aliases)
5. [Conditions: tokens, values and precedence](#conditions)
6. [Condition reference](#condition-reference)
7. [Item codes worth knowing](#item-codes)
8. [Formulas](#formulas)
9. [Output keywords](#output-keywords)
10. [Colors](#colors)
11. [Descriptions](#descriptions)
12. [%CONTINUE%](#continue)
13. [New lines: %NL%, %CL%, %CS%](#newlines)
14. [Length limits](#limits)
15. [Hiding items](#hiding)
16. [Notifications, minimap icons, sounds and TIER](#notifications)
17. [The evaluation pipeline and caching](#evaluation)
18. [Filter levels](#filter-levels)
19. [Where the wiki is out of date](#wiki)
20. [Feature history](#history)
21. [Community ecosystem and pitfalls](#ecosystem)
22. [Open questions to verify in game](#verify)

---

<a id="top-25"></a>
## 1. The 25 things that matter most

**Parsing**

1. **Everything from the first `//` is a comment**, anywhere on the line. That includes inside `[conditions]`, `{descriptions}` and URLs (`Config.cpp:480`).
2. **Unknown words are silently dropped.** A typo like `BARARIAN` just disappears. If everything in a rule is dropped, the rule matches every item. If an operator is left dangling, the rule never matches (§5).
3. **Keywords are case-sensitive.** `eth`, `ilvl>80` and `Rare` are read as *item codes* (no capital among the first three characters) and never match (`ItemDisplay.cpp:3844`).
4. **AND and OR have equal priority and are read left to right.** `UNI OR SET ETH` means `(UNI OR SET) AND ETH`. `&&` and `||` also work.
5. **Only one-character comparisons exist: `>`, `<`, `=`, `~`.** `ILVL>=80` is dropped completely, along with its closing parentheses.
6. **Spaces break comparisons.** `ILVL > 80` becomes `ILVL` (never true), `>` (dropped) and `80` (an item code).
7. **A value keyword with no comparison is always false.** `SOCK` on its own is false, and `!SOCK` is always true.
8. **A stray `)` makes PD2 throw away the rest of the rule.**

**Aliases, formulas and filter levels**

9. **Aliases are raw find-and-replace, in file order.** `Alias[AR]` also rewrites `RARE` and `ARMOR`. An alias whose value contains its own name hangs the game on load.
10. **Formula references are case-sensitive in conditions** (`FORMULAX`), and formulas can't use other formulas.
11. **`%TIER-n%` only reads one digit (0–9).** `%TIER-10%` prints as text. [wiki ✗]
12. **Filter levels:** 12 are read, and only levels 0–9 are reachable with hotkeys.

**Output and notifications**

13. **Only the first of each notification keyword counts.** Later duplicates print literally.
14. **The description runs from the first `{` to the first `}`.**
15. **Every matching rule replaces the description.** A later rule without `{}` clears it. End `%CONTINUE%` chains with `{%NAME%}`.
16. **`%CONTINUE%` only works outside the braces.**
17. **Only the first matching icon/sound rule notifies.** This holds even with `%CONTINUE%`, and even if the item is hidden.
18. **A rule silenced by TIER is skipped, not blocking.** The next matching icon/sound rule notifies instead.
19. **An item is hidden only when the output is exactly empty.** An output that is only a color (for example `%WHITE%`) shows an empty label.
20. **`%NOTIFY%` does nothing.**
21. **Names are cut at 56 visible characters** (512 in shops). `%NL%` counts as one character.
22. **Runes and some PD2 items carry their color inside `%NAME%`.** Use `%BASENAME%` to recolor them.

**Files and items**

23. **Since Season 13 the file is read as UTF-8.** ANSI special characters turn into �. [wiki ✗]
24. **Runes usually drop stacked** (`r30s`). `r30` alone misses them; `RUNE=30` matches both.
25. **`loot.filter` is a copy.** The game loads your selected file from `filters\`, so edit that file instead. [wiki ✗]

---

<a id="file-loading"></a>
## 2. How the launcher and game pick the file

### Launcher [PD2Launcher 48e8cb3]

- **Listing filters.** The author list comes from `Project-Diablo-2/LootFilters/filters.json`, fetched with an ETag and with a synthetic "Local Filter" author prepended.
  - Each author's `url` is a GitHub contents-API directory. The listing is not recursive, and only files ending in `.filter` are kept.
  - Requests are unauthenticated, so GitHub's limit of 60 requests per hour per IP applies.
- **`filter_definitions.json`** (optional, since S13) gives display names and `file_name_beta` variants.
- **Downloads** go to `ProjectD2\filters\online\<file>`. That folder is flat, so same-named files from different authors overwrite each other.
- **Local filters** must be in `filters\local`. Subfolders aren't scanned.
- **On Play or Save**, the selected file is **copied** to `loot.filter`; it is not a symlink. [wiki ✗]
  - Online filters are re-downloaded when the file's git SHA changes, which **overwrites hand edits** in `filters\online`.
- **Copy to Local** reads the file as text and writes UTF-8 without a BOM. That converts an old ANSI file, and ANSI-only bytes become �.
- **Preview Filter** is FilterBird. It doesn't implement notifications, sounds, the minimap, PREFIX/SUFFIX or MAPID.

### Game (BH)

- **Which file it loads** (`BH.cpp:191-231`). It reads `./AppData/launcherSettings.json`:
  - `filters\local\<name>` if the author is exactly "Local Filter";
  - otherwise `filters\online\<name>`.
  - If that fails it tries `loot.filter`, then `default.filter`, then shows a message box.
- **The file is opened read/write** (`std::fstream` default mode, `Config.cpp:464`). A **read-only filter fails to open** and PD2 silently falls back to the next file.
- **Encoding.** `CODE_PAGE = CP_UTF8` (`Constants.h:11`). The file is decoded as UTF-8, and invalid bytes become U+FFFD.
  - This changed on 2026-03-29 (commit 84b3dfb), and the wiki's "use ANSI" advice predates it. [wiki ✗]
- **A BOM is not stripped.** A directive on line 1 is then not recognised, because the key starts with the BOM (`Config.cpp:523`).
- **Line endings.** `std::getline` splits on `\n`, so a file with CR-only line endings is read as one line.
- **Reloading.**
  - Reload is triggered by PD2 through `BHInteract(BH_CONFIG_RELOAD)` (`BH.cpp:403-405`). BH's own Numpad 0 default is commented out, and the key is bindable in PD2's settings.
  - Rules are rebuilt on the next game loop (`Item.cpp:805-822`).
  - If every file fails to load during a reload, the old rules stay loaded.
  - Reloading doesn't reset the flags that record which items have already notified.

Filter Forge checks: `file.bom`, `file.encoding`.

---

<a id="line-syntax"></a>
## 3. Line syntax (`Config.cpp:456-535`)

- **Comments.** Everything from the first `//` is cut (`:480`). There's no escape and no block comment; `#` and `;` are not comments.
- **Key and value.** The key is the text before the **first** `:`, trimmed. The value is everything after it, trimmed (`:494-495`).
  - A line without a `:` doesn't fail. The key **and** the value both become the whole line (`find_first_of` returns npos, and npos+1 wraps to 0). So `ItemDisplay[ETH]` is a live rule whose output is the text `ItemDisplay[ETH]`, and `Alias[X]` hangs the game.
- **Trimming** (`Common.cpp:125-131`). Leading and trailing spaces are removed first, then leading and trailing tabs. So a line indented with tab then space keeps the space and the directive isn't recognised. `\r`, `\v` and NBSP are never trimmed.
- **Directive names** are matched case-sensitively as a *prefix* of the key: `ItemDisplay[`, `Alias[`, `Formula[`, `ItemDisplayFilterName[`.
  - `ItemDisplay [x]` (space before `[`) and `itemdisplay[` are ignored.
  - Any other key is ignored silently.
- **Bracket text** is everything after the first `[` with the key's **last character dropped**, whatever it is (`:527`).
  - `ItemDisplay[ETH: x` gives `ET`, which is dropped, so the rule matches everything.
  - `ItemDisplay[ETH] extra: x` gives `ETH] extr`.
- **Duplicates and order.** All lines are kept in file order. Alias and Formula lines may appear anywhere, because they're read before any rule is built.

Checks: `line.no-colon`, `line.bracket`, `line.comment-cut`, `line.directive-case`, `line.unknown-directive`, `line.indent`.

---

<a id="aliases"></a>
## 4. Aliases (`ItemDisplay.cpp:3329-3369`)

- **Name.** The bracket text, trimmed and cut at the first **space** (tabs don't cut it). An empty name is skipped.
- **Expansion.** For each rule, aliases are applied **in file order**, and each one is fully replaced before the next.
  - Chaining only works forward: an alias *defined after* A expands inside A's value, but one defined before A stays as literal text.
  - Duplicates all run; the first one effectively wins.
- **Conditions:** raw, case-sensitive substring replacement, not whole-word.
  - `Alias[AR]` rewrites RARE, ARMOR, CHARM, POLEARM, ARPER and CHARSTAT.
  - `Alias[ED]` rewrites EQUIPPED; `Alias[GEM]` rewrites GEMLEVEL and GEMMED.
  - Replacement also happens inside `$f(…)`.
  - A whole-word version (PR #63) was merged and then **reverted** (512e2c9).
- **Output:** only `%NAME%` written in UPPERCASE is replaced (`:3366-3368`), so `%myAlias%` prints literally.
- **Infinite loop.** The replacement is `while (find) replace`, so a value that contains its own name (or `%NAME%` on the output side) **hangs the game while it loads the filter**.
- **Not applied** to Formula bodies, filter level names, or other aliases' values (except through forward chaining).
- **Idiom:** `Alias[SHOW_X]: TRUE` / `FALSE` switches.

Checks: `alias.self`, `alias.clobber`, `alias.shadow`, `alias.space`, `alias.dup`, `alias.order`, `cond.alias-text`, `alias.output-case`, `alias.unused`.

---

<a id="conditions"></a>
## 5. Conditions: tokens, values and precedence (`ItemDisplay.cpp:3704-4464`)

### 5.1 Tokens

1. Aliases are expanded.
2. Inline `$f(…)` islands that compile are replaced by `ISLAND_A`, `ISLAND_B`, … Islands that fail to compile stay as raw text (§8).
3. The text is split on whitespace. NBSP is not whitespace.
4. From each token, a leading run of `!`, `(` and `)` is emitted immediately, and a trailing run is emitted after the operand.
   - The same characters **inside** a token stay in the key: `(ETH)(RARE)` becomes the key `ETH)(RARE`, which is dropped.

### 5.2 Operator and value

The operator is the first of `< = > ~`, one character only.

- **Empty value:** `ILVL>` means `ILVL>0`.
- **Range:** `~a-b` splits at the first `-`.
  - A negative lower bound is impossible.
  - `~80` with no dash means 80..0, which never matches.
  - `~b-a` with b > a never matches.
- **Reading the value.** It's read as C++ `>> int`:
  - leading digits only: `>5.9` means `>5`, `>5abc` means `>5`;
  - overflow and non-numbers fail.
- **When the value fails to parse, the whole condition is dropped** (`:3818`, `:3825`).
  - Leading `!`/`(` were already emitted, but the **trailing `)`/`!` are lost**.
  - So `!ILVL>=5 RARE` becomes `!RARE`, and `>=`, `<=`, `==`, `<>` all hit this path.
  - `!=` puts `!` into the key, so the key isn't recognised and the condition is dropped.

### 5.3 Classification (first match wins)

1. **Exact keyword.** `&&` and `||` are AND and OR. `NOT` is not a keyword.
2. **Item code.** 3+ characters with **no uppercase in the first three**. Only the first 4 characters are compared, exactly.
   - This catches `eth`, `and`, `100`, `fres+cres` and `$f(x`.
3. **Sum (`A+B`).** Any `+` in the key.
4. **Numbered prefixes.** `SK`, `OS`, `CHSK`, `CLSK`, `TABSK`, `STAT`, `CHARSTAT`, `MULTI`, in that order. A bad or out-of-range number **drops** the condition, which makes the rule broader.

   | Prefix | Allowed numbers |
   |---|---|
   | SK / OS / CHSK | 0..(Skills rows) |
   | CLSK | 0..6 |
   | TABSK | 0..50 |
   | STAT / CHARSTAT | 0..(ItemStatCost rows) |
   | MULTI | two numbers via regex, not range-checked; > 2³¹ throws at load |

5. **Formula reference.** Exact, case-sensitive `FORMULA<KEY>`.
6. **Otherwise** the token is **dropped silently**. Any trailing parentheses from the token are still emitted.

### 5.4 Operators and building the tree

- **Implicit AND** is inserted before an operand, `!` or `(` that follows an operand or `)`.
- **Precedence.** The shunting-yard pops *every* operator when a binary operator arrives, so **AND and OR have equal precedence and are read left to right**, and `!` binds to the next operand or group.
- **A stray `)`** makes PD2 return early. What was processed so far is kept and **the rest of the rule is thrown away**: `ETH) AND RARE` = `ETH`.
- **An unclosed `(`.** At the end, popping stops at it and **the operators below it are discarded**.
  - `(ETH SOCK>0` works.
  - `ETH OR (SOCK>0 RARE` loses its OR and never matches.
- **Rules that never match.** If an operator lacks an operand (`OR ETH`, `ETH AND`, a lone `!`), `Convert()` fails and the rule never matches (`:3474-3528`).
- **Rules that match everything.** A rule with **no conditions left at all** matches every item (`ItemDisplay.h:1154`). That covers `ItemDisplay[]`, `[()]`, `[Eth]`, `[STAT9999>0]` and a missing `]`.

### 5.5 How values compare

- `<` and `>` are strict, and `~` is inclusive.
- A value keyword with **no operator never matches** (so `!ILVL` always matches). Formulas are the exception: with no operator they are tested for truth.
- Flags and item codes **ignore** any operator: `ETH=0` still means ethereal.
- These targets are stored as a **byte**, so numbers outside 0–255 wrap: GEMLEVEL, GEMTYPE, RUNE, ILVL, QLVL, ALVL, MAPID, CRAFTALVL, REROLLALVL, LVLREQ, class.

Checks: `cond.*` (unknown, lowercase, item-unknown, item-long, two-char-op, bad-value, value-junk, empty-value, no-operator, spaces-op, op-ignored, param, formula-ref, range, add-part, paren-mid, stray-close, unclosed, never, match-all, byte, mixed).

---

<a id="condition-reference"></a>
## 6. Condition reference (`ItemDisplay.cpp:3900-5589`, `Item.cpp:190-560`)

### Quality and flags

Any operator on these is ignored.

- **ETH, RW, ID:** item flag bits. Normal and misc items count as identified.
- **Quality flags:** INF, SUP, MAG, SET, RARE, UNI and CRAFT are quality values 1, 3, 4, 5, 6, 7 and 8. **NMAG** is quality 1–3, which includes every misc item and every runeword base. Quality is visible before an item is identified.
- **Tier flags:** **NORM/EXC/ELT** depend on whether the code equals its row's `ultracode` (ELT) or `ubercode` (EXC); anything else is NORM.
  - Misc.txt has those columns, so **misc items are NORM**.
  - The exceptions are aqv2/cqv2 (EXC) and aqv3/cqv3 (ELT).
- **GEMMED:** anything socketed, which includes every runeword.
- **FOOLS:** stat 218 plus stat 224 in the item's magic list.
- **CLASS:** any class-restricted base.

### Item groups

- **Weapon subgroups.** The group is the **first ancestor type found** in this order: club, mace, hammer, wand, staff, bow, axe, scepter, sword, knife, javelin, spear, polearm, crossbow.
  - MACE is club, tipped mace or hammer.
  - **SPEAR excludes javelins.**
  - AXE includes throwing axes, and DAGGER includes throwing knives.
  - THROWING is independent of the chain.
- **HELM** is a head slot item that is **not a circlet**. It includes barbarian helms and druid pelts. **CIRC** is circlets only.
- **SHIELD** is the right-arm slot with the `shld` ancestor, which includes **paladin and necromancer shields**.
- **1H / 2H** come from a fixed table of vanilla codes.
  - **2H swords are 2H only**, never 1H.
  - PD2's `tp??` throwing potions are neither.
- **JEWELRY** is rings and amulets; **CHARM** is charms; **QUIVER** is arrows and bolts.
- **MISC** is every Misc.txt row, gold included. **WEAPON** and **ARMOR** are their tables' rows.

### Character and location

These depend on the viewer (mutable).

- **Class:** AMAZON … ASSASSIN.
- **CLVL**, **DIFF** (0–2), **FILTLVL** (0–12), **MAPID** (the player's zone; false when ≤0).
- **Location:** EQUIPPED (mercenary gear included), MERC, INVENTORY, CUBE, STASH, GROUND.
- **SHOP** is true when the item's owner is a vendor NPC, including gamble windows.

### Levels

- **ILVL** is the item level. **QLVL** is the base's quality level.
- **ALVL** = GetAffixLevel(ilvl, qlvl, magic lvl): `ilvl = min(ilvl,99)`; if `qlvl > ilvl` then `ilvl = qlvl`; if `mlvl > 0` the result is `min(ilvl + mlvl, 99)`; otherwise it's `ilvl − ⌊qlvl/2⌋` when `ilvl < 99 − ⌊qlvl/2⌋`, else `2·ilvl − 99`.
- **CRAFTALVL** uses `⌊clvl/2⌋ + ⌊ilvl/2⌋` as the item level (mutable).
- **REROLLALVL**:
  - 0 for maps, corrupted items, and anything that isn't magic or rare;
  - rares use `⌊0.4·ilvl⌋ + ⌊0.4·clvl⌋`;
  - magic items use ilvl.

### Requirements

- **LVLREQ** is the full requirement, including affixes; for magic and rare items it's the minimum over all classes. **REQLVL** is the same for the current class.
- **REQSTR / REQDEX** include stat 91, and ethereal items get −10.
- **UPSTR / UPDEX / UPLVL** are the requirements of the next tier up, and 0 for elite and misc items.

### Sockets and size

- **SOCKETS / SOCK** is stat 194. **MAXSOCKETS** depends on the item level [verify].
- **WIDTH, HEIGHT, AREA** are the inventory size.

### Item kinds

These are **only true on their own item kind**; everywhere else they're false.

- **GOLD:** codes starting `gld`.
- **RUNE:** runes and stacked runes (r01–r33, r01s–r33s).
- **GEMLEVEL / GEMTYPE:** gems, including PD2's stacked flawless and perfect gems.
- **MAPTIER** is 1–5 for t1m–t5m types and 0 for PvP maps. It is **−1 for everything else**, so `MAPTIER<n` is true for all non-maps.
  - The tier comes from the item *type*, not the code's digits.

### Affixes

- **PREFIX / SUFFIX:**
  - only `=` and `~` work; `<` and `>` are always false;
  - they're false for unidentified rares;
  - they're always false on uniques and sets.
- **AUTOMOD** is false for unidentified magic and rare items. With no automod the value is negative, so `AUTOMOD<n` also matches items without one.

### Prices

- **PRICE / SELLPRICE** is the sell price, **always at Malah**, and depends on difficulty and quests.
- **BUYPRICE** uses the open vendor, or Malah if none is open.

### Stats

- The value is the item's stat total. [verify: unidentified items may read 0]
- **LIFE / MANA** compare in normal units; the ×256 is handled internally.
- **ED:** stat 16 on armor, 17 otherwise, **from the magic list only**, so runeword and socket stats aren't counted. **EDEF / EDAM** include them.
- **MINDMG / MAXDMG** are the added flat damage: `max(21,23,159)` and `max(22,24,160)`.
- **RES** requires **each of the four resistances** to pass. `RES<30` means *all* resistances are below 30.
- **MAXRES / ALLATTRIB** are 0 unless all four values are non-zero.
- **CHSKn** is the highest charge *level* of skill n.
- **CHARSTATn** is the player's raw stat; life and mana are ×256 here.
- **GOODSK / GOODTBSK** depend on each user's BH config (usually empty).

### Sums (`A+B`)

- Only these can be summed: LIFE, MANA, STR, DEX, CRES, FRES, LRES, PRES, MINDMG, MAXDMG, EDEF, EDAM, FCR, AR, REPLIFE, STATn, MULTIa,b, and formula names.
- **Anything else adds 0**, including IAS, FHR, RES and SK.
- A sum only keeps the lower bound, so **`~` never matches** when a formula is part of it.

Checks: `sem.conflict`, `sem.range-conflict`, `sem.domain`, `sem.affix-op`, `sem.res`, `sem.maptier`, `sem.gold`.

---

<a id="item-codes"></a>
## 7. Item codes worth knowing (Season 13 data)

- **Runes.** `r01`–`r33` and stacked `r01s`–`r33s` are **different codes**. Runes have stacked since S1 and usually drop stacked, so use `RUNE=n` or `(r30 OR r30s)`.
- **Gems.** Flawless and perfect gems stack: `gzvs gpvs glys gpys glbs gpbs glgs gpgs glrs gprs glws gpws skls skzs` (types gg3x / gg4x).
- **Maps.**
  - Types t1m–t5m, plus `pvpd`/`pvpm` and `ubr`.
  - The number in a code is **not** its tier: `t12` is tier 2.
  - Uniques are `t51`–`t58`. Tier 3 `t3b` is new in S13.
  - Use MAPTIER rather than code patterns.
- **Shards.** `wss`, `cwss` (tainted) and `iwss` (catalyst) have their color built into the name.
- **Currency.** `imma imrn imra rera scou upma upmp fort scrb lbox lpp rkey`, the infused `irma irrn irra rrra urma`, and the craft infusions `crfb crfc crfs crfh crfv crfu crfp`.
- **Corrupted hero ears.** `ivea ivez iveb ived iven ivep ives` (S13).
- **Arrows and bolts.** `aqv aqv2 aqv3`, `cqv cqv2 cqv3`.
- **Renamed codes.** Codes can change between seasons, e.g. Overlord's Helm `uhl` → `uh9` in S13.

Checks: `cond.item-unknown`, `sem.stacked`.

---

<a id="formulas"></a>
## 8. Formulas (`Formula.h`, `ItemDisplay.cpp:1780-2746, 3200-3352`)

### Defining formulas

- `Formula[KEY]: expr` is registered as `FORMULA` + KEY in upper case (a–z only). The key is **not trimmed**, so `Formula[ A ]` can never be referenced.
- The directive must be spelled exactly `Formula[`.
- **Formulas that fail to compile are skipped silently.** For duplicate keys, the last one that compiles wins.

### Syntax

- Formulas are case-insensitive and use **32-bit floats**.
- Numbers work like `wcstof`: `1.5`, `.5` and `1e3` are all valid.
- Operators: `== != > < >= <=` (**one precedence level**, left-associative), `+ -`, `* /`, `^` (right-associative), and unary `- + !`, which bind tighter than `^`.
  - So `1<X<5` is always 1, and `-2^2` = 4.
  - There is no `=`, `&&`, `||` or `%` operator; use `==`, `and()`, `or()` and `mod()`.
- Functions: `if` (lazy), `and`, `or` (short-circuit), `xor`, `exp`, `ln`, `floor`, `ceil`, `round` (halves away from zero), `min`, `max` (ignore NaN), `mod` (fmod), `average`, `sqrt`, `pow`, `count`, `countif`, `abs`, `sign`.

### Variables

- There are 159 variables, which mirror the condition codes: flags are 1 or 0.
- `stat`, `multi` (two numbers), `charstat`, `chsk`, `cl`, `clsk`, `eq`, `os`, `sk`, `tabsk` and `wp` take numbers.
- Use `onehand` / `twohand`, not `1H` / `2H`.
- **Unknown names are compile errors, and so are other formulas.** PREFIX, SUFFIX and GOODSK aren't available.

### Evaluation

- **NaN counts as true.** Division by zero, `ln(0)` and `sqrt(-1)` raise no error.
- Only out-of-range numbers (`EQ8`, `WP14`, `CL0`, `CLSK7`, SK above the maximum) raise a runtime error. The condition is then false and the output shows `f_err`.

### Using formulas in conditions

- `FORMULAX` is an **exact, case-sensitive** match. [wiki ✗: it says only the F must be capital]
- A missing or failed formula reference is dropped.
- `FORMULAX>2.5` compares against **2**. `>=` drops the token.
- With no operator the formula is tested for truth.
- `$f(x)+STAT2>15` is a sum.

### Using formulas in output

- Output references are case-insensitive: `%FORMULAX%`.
- A key containing digits prints literally, because `%FORMULAX1%` is read as `FORMULAX` with parameter 1.
- A missing formula prints literally.
- Values render as `%.2f` of the float, with trailing zeros trimmed (`1.50` → `1.5`, `10.00` → `10`).
  - Exact ties round to even (0.125 → 0.12).
  - `-0` is possible.
  - The result is `f_err` beyond ±2³¹ or for non-finite values.

### Inline `$f(…)` islands

- Only lowercase `$f(` starts an island, and nested parentheses are allowed.
- An island that fails to compile stays as text. In a condition it becomes junk item codes plus a stray `)`.
- A user-written `ISLAND_A` binds to the first generated island in the file.

Checks: `formula.*`, `cond.island`, `cond.formula-ref`, `out.formula`, `out.island`.

---

<a id="output-keywords"></a>
## 9. Output keywords (`ItemDisplay.cpp:1067-1260, 3554-3625`)

### How the output is built (BuildAction)

1. Aliases are expanded (`%UPPER%` only).
2. Islands are replaced by `%ISLAND_x%`.
3. **Uppercase pass**: `%word%` tokens that contain lowercase letters are uppercased, but only when their opening `%` is at an **even position** among all `%` signs. A lone literal `%` earlier in the text flips this, and the later lowercase keywords print literally.
4. `%BORDER|MAP|DOT|PX|LINE|NOTIFY-xxxx%` and `%TIER-d%` are taken from the whole text, including braces. Only the **first match** of each counts.
5. The description is cut out: from the first `{` to the first `}`.
6. `%SOUNDID-n%` and the legacy `%MAP%` are taken from the name part only.
7. `%CONTINUE%` is taken from the name part only, first occurrence.

### Tokens

- A token must match `%([A-Z_]+)(\d{1,9})?(,\d{1,9})?%`.
- An unknown name prints literally, and scanning restarts at the closing `%`.
- A known name with the wrong number of parameters (`%STAT%`, `%NAME3%`) prints literally.

### What prints a value

- **Names and codes:** NAME, BASENAME, CODE, RUNENAME, RUNENUM, GEMLEVEL, GEMTYPE.
- **Levels:** ILVL, ALVL, CRAFTALVL, REROLLALVL, LVLREQ.
- **Weapon speed and range:** WPNSPD, RANGE.
- **Prices:** PRICE, SELLPRICE, BUYPRICE.
- **Counts and resists:** QTY, SOCKETS, RES, ED.
- **Requirements:** REQSTR, REQDEX, REQLVL, and the UP* values.
- **Base values:** BASEMIN/MAX{ONEH, TWOH, THROW, KICK, SMITE}, BASEBLOCK, ALLATTRIB, MAXRES, MAXSOCKETS, MINDMG, MAXDMG.
- **Named stats:** EDEF, EDAM, DEF, FRES, CRES, LRES, PRES, IAS, FCR, FHR, FBR, LIFE, MANA, ARPER, MFIND, GFIND, STR, DEX, FRW, AR, DTM, MAEK, REPLIFE, REPQUANT, REPAIR.
- **Numbered:** STATn, SKn, OSn, CLSKn, TABSKn, CHARSTATn, MULTIa,b.
- **Literal characters:** LBRACE, RBRACE and PERCENT print `{`, `}` and `%`.
- **Not printable** (they print literally): SOCK, WIDTH, HEIGHT, AREA, QLVL, ALLSK, GEM, CHSK, MAXDUR.

### Values on other item kinds

- `%RUNENAME%`, `%GEMLEVEL%` and `%GEMTYPE%` are **empty** on other items. An output made only of them **hides** those items.
- `%RES%` is 0 unless all four resistances are non-zero.

Checks: `out.unknown`, `out.params`, `out.lowercase`, `out.percent`, `out.item-keyword`.

---

<a id="colors"></a>
## 10. Colors

- **Classic colors:** `%WHITE% %RED% %GREEN% %BLUE% %GOLD% %GRAY% %TAN% %ORANGE% %YELLOW% %PURPLE% %DARK_GREEN%`.
- **Custom colors:** `%BLACK% %CORAL% %SAGE% %TEAL% %LIGHT_GRAY%` render correctly only in **Glide** mode. Otherwise they fall back to classic colors.
- **Transparency:** `%FULL_TRANS% %THREE_FOURTHS_TRANS% %HALF_TRANS% %QUARTER_TRANS%` need D2GL or HD text. Otherwise they do nothing, and they still cost 3 characters each.
- **Default color.** The game adds the item's quality color first, so text before any color keyword uses it.
- **Built-in colors.** Runes, Standard of Heroes, shards and some PD2 items carry a color **inside `%NAME%`**, which overrides any color placed before it. `%BASENAME%` strips it.

Checks: `out.builtin-color`.

---

<a id="descriptions"></a>
## 11. Descriptions

- **What counts as the description.** It runs from the **first `{` to the first `}`**.
  - `{a}{b}` gives the description `a`, and the name gets a literal `{b}`.
  - If the `{` is unclosed or comes after the `}`, there's no description and the braces print.
  - Use `%LBRACE%` and `%RBRACE%` for literal braces.
- **Every matching rule replaces the description**, and **a rule without braces clears it**. To carry text through a `%CONTINUE%` chain, every later matching rule needs `{%NAME%…}`, where `%NAME%` inside braces means the description so far.
- **The game's own description isn't available.** BH's text is an extra tooltip line.
- **Length.** The limit is a dynamic budget capped at 512 characters, with "..." added when cut.

Checks: `out.braces`, `flow.desc-wiped` (deep check).

---

<a id="continue"></a>
## 12. %CONTINUE%

- Only the **first** `%CONTINUE%` outside the braces counts. A second one, or one inside `{}`, prints literally, and that rule then **stops** processing.
- The stored `%NAME%` keeps unresolved `%CL%`/`%CS%` until the end of the chain.
- A hide rule sets the name to empty, so a later `%NAME%` stays empty.

Checks: `out.continue-desc`, `out.duplicate`.

---

<a id="newlines"></a>
## 13. New lines: %NL%, %CL%, %CS%

- **In descriptions**, `%NL%` always works.
- **In names**, `%NL%` and `%CL%` work for:
  - identified items of magic quality or higher;
  - runewords;
  - items in a vendor's window.

  Normal and superior "staffmod" items allow only the **first** one. Everywhere else they produce nothing and the text runs together.
- **Lines stack upward.** In notifications, a new line becomes " - ".
- **`%CL%`** makes a new line only if something came before it, the text so far doesn't already end in one, and more text follows.
- **`%CS%`** makes a space only if it would sit between two non-space characters.

Checks: `out.newline`.

---

<a id="limits"></a>
## 14. Length limits

- **Names** have **56 visible characters** (512 for shop items).
  - Color codes are free; `\n` counts as 1, and the transparency codes count as 3.
  - Longer names are **silently truncated**, with no crash. The internal cap is 511 characters, 126 for tomes.
  - [wiki ✗: the wiki gives "125 internal, NL = 2"]
- **Descriptions** are capped at 512 characters.
- **Notification text** is cut at 151 bytes.

Checks: `out.name-length`.

---

<a id="hiding"></a>
## 15. Hiding items

- **The label is hidden only when the final name is exactly empty.**
  - An output that's only a color, or only spaces, shows an empty label.
  - Output that *renders* empty does hide, for example `%CS%` alone or `%RUNENAME%` on a non-rune.
- **Filter level 0** (Show All Items) keeps the original name when the result is empty.
- **The sprite** (the item graphic on the ground) is decided when the item appears:
  - any matching rule with an icon or sound keeps it visible;
  - otherwise a matching rule with an empty output hides it, even if it's a `%CONTINUE%` rule. [verify]
- **Hidden items still notify** if an icon/sound rule matches them, and the notification shows an empty name.

Checks: `out.hide-with-icon`, `out.blank-label`.

---

<a id="notifications"></a>
## 16. Notifications, minimap icons, sounds and TIER (`MapNotify.cpp`)

### Map rules

- Only **map rules** take part: rules with BORDER, MAP, DOT, PX or LINE, or a valid SOUNDID.
- NOTIFY or TIER alone don't make a rule a map rule.

### Keyword syntax

- Colors are `%KEY-x…%`, **1 to 4 hex digits**, case-insensitive.
  - Only the first of each kind counts; invalid or duplicate ones print literally.
  - `BEEF` means "undefined".
- `%TIER-d%` takes a **single digit, 0–9**. `%TIER-10%`–`%TIER-12%` print as text. [wiki ✗]
- `%SOUNDID-n%` takes 1–4 digits.
  - The id must exist and must not be a looping or music sound.
  - An invalid id becomes 0, and a rule with no icon then isn't a map rule at all.
  - SOUNDID isn't read inside `{}`.
- **Legacy `%MAP%`** uses the color keyword whose first occurrence is the last one before it. It also sets the BORDER color, and it overrides `%MAP-xx%`.
- **`%NOTIFY-x%` is ignored**: its code is commented out.
- **`%LINE-xx%`** is parsed, but BH doesn't draw it. [verify PD2's client]

### The notification pass

- Each ground item is checked **once**, in file order over map rules.
- A rule is **skipped** when the filter level isn't 0, the rule has a TIER, and the TIER is below the level.
- **The first remaining match** prints the text (the filtered name, in the quality color), plays the sound, and marks the item as revealed.
  - This happens **regardless of `%CONTINUE%` or hiding**.
  - Detailed Notifications must be on. The sound also needs Drop Sounds on.
- Items notify again when they re-enter view.

### Minimap icons

- Only revealed items get icons. Every matching map rule draws its icon, with **no TIER filter**, up to the first rule without `%CONTINUE%`.
- Sizes: BORDER 8×8, MAP 6×6, DOT 4×4, PX 2×2.
- If every matching map rule is skipped by TIER, the item isn't revealed and gets **no icon**. [verify; the wiki says TIER-0 keeps icons]

### TIER in practice

`%TIER-n%` lets a rule notify at filter levels 0..n. The default is every level; the wiki's "acts like TIER-9" is wrong for levels 10–12.

Checks: `out.notify-syntax`, `out.tier-no-effect`, `out.notify-noop`, `out.sound`, `out.duplicate`, `flow.notify-shadowed` (deep check).

---

<a id="evaluation"></a>
## 17. The evaluation pipeline and caching

| What | When | Rules walked | Stops at |
|---|---|---|---|
| Ground label (name) | label draw | all rules | first match without `%CONTINUE%` |
| Tooltip description | tooltip | all rules, separate pass | same |
| Text notification and sound | once per item | map rules minus TIER-skipped | first match |
| Minimap icons | automap draw | map rules, no TIER filter | first without `%CONTINUE%` |
| Hide the sprite | item packet | map rules, then all rules | see §15 |

### Caching

- Results are kept in an LRU cache of 100 items, keyed by item id and the item's flags, mode and location.
- **Not in the key:** character level, class, zone, difficulty and vendor.
- **The cache is cleared** when the filter level changes, you join a game, the filter reloads, or the item's flags/location change (identify, socket, pick up).
- **So rules with mutable conditions freeze** until something invalidates the cache: CLVL, MAPID, class, CHARSTAT, `%CRAFTALVL%`, `%BUYPRICE%`.

### What this means for filters

- **Put `%CONTINUE%` tag rules first**, then the specific style rules, then the general fallbacks.
- **Order map rules from most to least specific.** Only the first matching one plays its sound.
- **Check for catch-alls.** An effectively-empty rule without `%CONTINUE%` hides everything below it.

Checks: `flow.unreachable`, `flow.duplicate`, `flow.shadowed` (deep check).

---

<a id="filter-levels"></a>
## 18. Filter levels

- **Level 0** "Show All Items" always exists. Each `ItemDisplayFilterName[]: Name` adds levels 1, 2, … in file order. The number in the brackets is ignored.
- **Up to 12 levels are read.** The code comment says 9 [wiki ✓ 12]. With none defined, "1 - Standard" is used.
- **Hotkeys.** Ctrl+Numpad 0–9 reaches levels 0–9 only; levels 10–12 need the menu.
- **Saved level.** If the saved level is above the number of levels, it resets to 1.
- **FILTLVL** compares against the selected level. **Level 0 never hides.**

Checks: `levels.max`, `levels.hotkey`, `sem.domain` (FILTLVL above the defined levels).

---

<a id="wiki"></a>
## 19. Where the wiki is out of date (revision 22837, 2026-04-30)

| Wiki says | Engine does |
|---|---|
| "UTF-8 works, but special characters need ANSI" | UTF-8 only since 2026-03-29 |
| "loot.filter is a system link" | It's a copy, and the selected `filters\` file is loaded first |
| Names allow "125 internal characters", "NL = 2", descriptions "500" | 56 visible (512 in shops), NL = 1, silent truncation; descriptions 512 |
| "No TIER acts like TIER-9"; "TIER can be 0–12" | No TIER means every level; TIER is one digit, 0–9 |
| "TIER-0 disables text but not map icons" | Probably no icon either [verify] |
| PREFIX example `~1279-1353` | Pre-S7 ids; current prefixes are 1–805 |
| "Only the F of a formula reference must be capital" | The whole reference is case-sensitive |
| "Formula keys: A–Z and _" | Not enforced; digits break output and sums; spaces break everything |
| `%NL%` in names only for ID magic+, runewords and shops | Also the first `%NL%` on normal/superior staffmod items |
| Aliases | Doesn't mention substring replacement, order dependence, the self-reference hang, or the cut at the first space |
| Numpad 0 reloads | BH's default is commented out; the key is PD2-bindable |
| `%PERCENT%`, `%LBRACE%`, `%RBRACE%`, `%LINE-xx%`, `%*_TRANS%`, GOODSK, REPQUANT, `&&`, `\|\|` | Not documented |

---

<a id="history"></a>
## 20. Feature history (BH `ItemDisplay.cpp`, 173 commits)

Seasons: S5 2022-06, S6 2022-11, S7 2023-04, S8 2023-09, S9 2024-04, S10 2024-10, S11 2025-05, S12 2025-11, S13 2026-04. **Bold** entries change the meaning of existing filters.

- **2021:** CRAFTALVL, class keywords, PREFIX/SUFFIX, MAPID, 1H/2H, SHOP, EQUIPPED, GEMMED.
- **2022-05:** filter levels (`ItemDisplayFilterName`, FILTLVL, `%TIER%`); **level 0 never hides**.
- **2023-01/02:**
  - AUTOMOD, `~`, MAPTIER, EDEF/EDAM/SOCKETS, `%SK#%`-style outputs, `%RES%`;
  - **comparisons became signed**;
  - **`%STAT-#%` was renamed `%STAT#%`**;
  - **MINDMG/MAXDMG now mean the added bonus**.
- **2023-04 (S7):**
  - **ED excludes runeword and socket stats**;
  - **LIFE/MANA scaling fixed**;
  - **MAPTIER no longer matches non-maps**;
  - **PREFIX/SUFFIX/AUTOMOD renumbered from 1**.
- **2023-08/10:** CLASS, CLUB, TMACE, HAMMER; `%NL%` allowed in shops; `%CL%`, `%LBRACE%`, `%RBRACE%`; overlong names truncate instead of crashing.
- **2024-04 (S9):**
  - short-circuit evaluation;
  - **unknown `%X%` stays literal**;
  - **12 filter levels**.
- **2024-10 (S10):** `Alias[]` added. The whole-word alias fix was merged and reverted in 2025-05.
- **2025-05 (S11):**
  - STAT/MULTI allowed in sums;
  - invalid, looping and music sounds are blocked;
  - **hiding is decided after all rules run**.
- **2025-11 (S12):**
  - `%BASENAME%`, REROLLALVL, TRUE/FALSE;
  - MISC, JEWELRY, CHARM, QUIVER;
  - location conditions;
  - BUYPRICE/SELLPRICE.
- **2026-01/02 (S13):**
  - WIDTH/HEIGHT/AREA;
  - **`Formula[]` and `$f()`**;
  - MAXSOCKETS, UP*/REQ*/BASE* keys, MAXRES, ALLATTRIB, BASEBLOCK;
  - `%CS%`.
- **2026-03/04:**
  - **UTF-8 file decoding**;
  - wide strings;
  - `%PERCENT%`;
  - MINDMG/MAXDMG fixed for all weapons.
- **2026-07:** crash fixes.

---

<a id="ecosystem"></a>
## 21. Community ecosystem and pitfalls

- **Tools:**
  - The shared `validate_filters.py` (eqN, Kassahi, Hiim) disagrees with the engine on `%TIER-10%+` and on `//` inside braces.
  - Kassahi and Hiim build filters from segment files, with prices pulled from PD2 Trader.
  - FilterBird is the launcher's preview.
  - There's a VS Code hint extension.
  - `.playsound n` tests a sound in game.
- **Scale:** real filters run from 3k to 10k rules and are 0.4–1.8 MB. Alias expansion costs rules × aliases string scans when the filter loads.
- **Common mistakes:**
  - editing `loot.filter` or `filters\online` files;
  - last season's map codes;
  - "Enable Loot Filter" switched off;
  - a missing `%CONTINUE%` in tag rules;
  - `%Yellow%` written in mixed case;
  - `.filter.filter` or `.txt` file names;
  - `Alias[X]` values that contain the alias's own name;
  - the `r30` / `r30s` mismatch.
- **In-game settings:**
  - Detailed Notifications: 0 off, 1 on, 2 new items only.
  - Drop Sounds must be on for `%SOUNDID%`.
  - "Always Show Items" is independent of the filter.
  - "Show Item Level" duplicates what many filters already add.

---

<a id="verify"></a>
## 22. Open questions to verify in game

- Do rules skipped by TIER also suppress the minimap icon? The code says yes.
- Can a `%CONTINUE%` rule with empty output hide the sprite even when a later rule names the item?
- Does PD2's closed client draw `%LINE-xx%`?
- Do unidentified magic, rare, set and unique items expose their affix stats to filter conditions?
- Does DEF include +ED%?
- How does MAXSOCKETS depend on item level?
- Is Numpad 0 PD2's default reload key?

When one of these is confirmed, update this document and the matching check message in `src/lib/lint.ts`.
