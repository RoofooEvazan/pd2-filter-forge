# Findings C — Output & display pipeline (BH @ 662229b6)
(Saved from researcher C's report. ID.cpp = ItemDisplay.cpp, MN = MapNotify.cpp, RLC = RuleLookupCache.h)

## Pipeline
Load (InitializeItemRules ID:3297-3424; run from Item::OnLoop Item.cpp:819; reload via UninitializeItemRules Item.cpp:637):
1. Alias expansion ID:3358-3369 — conditions: raw exact case-sensitive find; output: `%UPPER(alias)%` case-sensitive → `%myAlias%` NOT expanded, later uppercased to unknown `%MYALIAS%` (literal).
2. Formula islands ID:3372-3373: output `$f(expr)` → `%ISLAND_A%`...; failed compile leaves literal `$f(...)` (3280-3282); missing `)` copies `$f(` through (3286).
3. Rule construction ID:3446-3456: BuildAction; name/desc tokenized once.
4. Lists ID:3385-3394: RuleList all; MapRuleList iff BORDER/MAP/DOT/PX/LINE color or soundID!=0 (NOTIFY/TIER don't qualify); IgnoreRuleList = non-map empty-name rules — NEVER READ (dead).

BuildAction order ID:3554-3625: uppercase pass (3561-3581) → BORDER/MAP/DOT/PX/LINE/NOTIFY (ParseMapColor) + TIER, each searches whole string incl braces, removes FIRST match only → ParseDescription (first `{` .. first `}`) → SOUNDID (after braces cut; inside braces not parsed) → legacy %MAP% (name only) → %CONTINUE% (name only, first).

Per item:
| Output | Path | Rules | Stops | Cache |
|---|---|---|---|---|
| Name | ItemNamePatch Item.cpp:892 → GetItemName ID:2829 → item_name_cache (2778-2796) | RuleList | first matching with stopProcessing | LRU 100 |
| Description | BHOnProperties Item.cpp:1428 → item_desc_cache (2749-2763) | RuleList separate pass | same | LRU 100 |
| Text notification + sound | MapNotify::OnDraw MN:53-116 once per unit | MapRuleList w/ TIER filter | first qualifying match, break regardless of %CONTINUE% (MN:108) | unit flags |
| Automap icons | OnAutomapDraw MN:118-180 → map_action_cache ID:2810 | MapRuleList, no TIER filter | draws until first action with stopProcessing (MN:170) | LRU |
| Sprite INVISIBLE | ProcessItemPacketFilterRules Item.cpp:1051-1112 on NewGround/OldGround packets | MapRuleList then RuleList | §7 | none |

## 1. Output keywords
Tokenizer ID:1180-1215 regex `%([A-Z_]+)(?:(\d{1,9})(?:,(\d{1,9}))?)?%`. Names A-Z_ only; digits = params. Unknown name → literal text from `%` up to closing `%`, scan restarts at closing `%` (1197-1203): `%FOO%NAME%` → `%FOO` + name. Known name with wrong param count → whole match literal (1233-1236) e.g. `%STAT%`, `%NAME3%`, `%SK5,3%`. Tokens with `-` never match → literal (leftover notify keywords become visible). Formula keys with digits can't print: `%FORMULAX1%` = FORMULAX + param 1 (3342-3351).

ReplacementMap ID:1067-1176 (anything else literal except FORMULA*/ISLAND_*):
- NAME: accumulated name (in braces: accumulated desc); truncated 1023 (1292)
- BASENAME: tbl name with one leading ÿcX stripped only at index 0 (1300; Common.cpp:118)
- SOCKETS stat 194 any item ("0"); RUNENUM rune flag only else "0"; RUNENAME tbl name up to first space, color NOT stripped (2854), "" non-rune; GEMLEVEL/GEMTYPE gem flag only else "" (2866-2880)
- ILVL, ALVL; CRAFTALVL uses ⌊clvl/2⌋+⌊ilvl/2⌋ (mutable, 2901); REROLLALVL, LVLREQ; WPNSPD, RANGE ("0" non-weapons); CODE; LBRACE/RBRACE/PERCENT
- BUYPRICE/SELLPRICE/PRICE (Malah fallback vendor 867-883; "" quest items); QTY stat 70
- RES = min(F,L,C,P) ONLY if all four non-zero else "0" (2983)
- ED: stat 16 armor else 17 (stat list 0x40)
- CS, CL, NL control chars (§6)
- REQSTR/DEX/LVL, BASEMIN/MAX{ONEH,TWOH,THROW,KICK,SMITE}, BASEBLOCK, ALLATTRIB, MAXRES, UPSTR/DEX/LVL, MAXSOCKETS, MINDMG, MAXDMG via condition GetValue
- Named stats: EDEF EDAM DEF FRES CRES LRES PRES IAS FCR FHR FBR LIFE MANA ARPER MFIND GFIND STR DEX FRW AR DTM MAEK REPLIFE REPQUANT REPAIR (LIFE/MANA /256)
- STATn SKn OSn CLSKn TABSKn CHARSTATn (player, mutable) MULTIa,b; "" if id > max
- FORMULA/ISLAND: %.2f strip ".00" or one trailing "0", float; `f_err` on eval error / non-finite / |x|>2^31 (1257)
- NOT keywords (literal): SOCK, WIDTH, HEIGHT, AREA, QLVL, ALLSK, GEM, CHSK, MAXDUR

Uppercase regex ID:3563-3576 `^(?:(?:%[^%]*%)|[^%])*%((?:\w|_|-)*?[a-z]+?(?:\w|_|-)*?)%` looped: uppercases %body% with ≥1 lowercase letter only when opening % is at even parity among all % chars. A lone literal % flips parity: `100% %name%` stays lowercase → literal. Covers braces; uppercases non-keyword text like `5%of%` → `5%OF%`. Notification parsers case-insensitive; legacy %MAP% and %CONTINUE% case-sensitive find → parity-broken `%continue%` ignored and prints. Regex exception on very long output → whole output `ÿc1FILTER REGEX ERROR` (3578).

## 2. Unknown keywords stay literal (uppercased where parity allows).

## 3. Colors
WHITE ÿc0 RED ÿc1 GREEN ÿc2 BLUE ÿc3 GOLD ÿc4 GRAY ÿc5 TAN ÿc7 ORANGE ÿc8 YELLOW ÿc9 PURPLE ÿc; DARK_GREEN ÿc:.
Glide (RenderMode==4, 1702-1707): BLACK \x02 else c6; CORAL \x06 else c1; SAGE \x07 else c2; TEAL \x09 else c3; LIGHT_GRAY \x0C else c5.
*_TRANS emit ÿc\x40..\x43 only with D2GL/HD text; else "" (previous color continues) (1709).
Game adds quality color after BH hook (Item.cpp:970) = base color. Quest items have extra code (910). Leading tbl color in %NAME% overrides preceding keywords; %BASENAME% strips one; %RUNENAME% keeps. Allocated items get `\nÿc1(Allocated)` (934-947).
Legacy map palette ID:14-34: WHITE 20 RED 0A GREEN 84 BLUE 97 GOLD 0D GRAY D0 BLACK 00 TAN 5A ORANGE 60 YELLOW 0C PURPLE 9B DARK_GREEN 76 CORAL 66 SAGE 82 TEAL CB LIGHT_GRAY D6 TRANS CB. Boxhook passes value unclamped (Boxhook.cpp:138).

## 4. %NAME% / %CONTINUE% / descriptions
Name pass starts from game name minus one leading+trailing space (2782-2783); each match sets ctx.name = ApplyName; hide rule sets "" so later %NAME% = "".
Description pass starts "" (game desc not accessible; BH text is an extra tooltip line Item.cpp:1966-1975). EVERY matching rule sets desc = its description; a rule WITHOUT braces sets "". Carry forward only if each later rule has `{%NAME%...}`.
%CONTINUE% first occurrence outside braces → stopProcessing=false for both passes; second prints literally; inside braces = no continue + literal. Stored name keeps raw \b \r \n; CS/CL resolved at end.
Name and desc evaluated separately (label time vs tooltip time) — mutable conditions can disagree.

## 5. Braces & limits
ParseDescription 3669-3679: first `{` and first `}`; missing either, or `{` after `}` → no description, braces literal. `{a{b}c}` → desc `a{b`, name gets `c}`. `{a}{b}` → desc `a`, name gets literal `{b}`. Unclosed `{abc` literal.
Name limits (TrimItemText bLimit 3018-3101 + ItemNamePatch): color codes `\xFFc[0-9;:\x01-\x1F]` = 0 visible; TRANS (\x40-\x43) NOT excluded (3 visible each). Visible limit 56 (512 shop items); `\n` counts 1; across lines. Overflow silently truncated. Hard cap 511 (126 tomes tbk/ibk). ItemNamePatch buffer 128 (124 quest, 512 gamble) → effective cap 127 wchar; trailing ÿc in last 5 chars cut; NPC buy popup (191) unfiltered. No crash. Wiki "125, NL=2" outdated.
Description: TrimItemText 511 cap; BHOnProperties budget = 1023 − name − predicted tooltip lines, cap 512 (Item.cpp:1482-1964); ≤4 → not shown; else truncated to budget−4 + "...".

## 6. %NL% %CL% %CS%
Descriptions: NL always \n, CL \r.
Names (1567-1595, 1716-1736): nlAllowed = (IDENTIFIED && (quality ≥ magic || runeword)) || item in one of 16 vendor NPC inventories (ID:848). Else if nmagStaffmod (inferior/normal/superior AND (type has staffmod class OR autoprefix not 0/308 OR superior)) only the FIRST NL/CL in the whole chain works. Else NL/CL → "" (text runs together). CS always \b.
Final resolution 3022-3058: \r → \n only if output non-empty, last char not \n, next raw char exists and isn't \n/\r (trailing CL dropped; CL followed only by a color kept → color-only line). \b → space only if prev not whitespace and next exists and not whitespace (color code counts non-whitespace). \n always. Lines bottom-up. In notifications \n → " - ".

## 7. Hiding
Label hidden only if final string exactly "" (GetItemName 2829-2837). Level 0: original name kept when empty; non-empty modifications still apply. Space-only/color-only (`%WHITE%`) NOT hidden (blank label). Renders-empty hides: `%CS%` alone, `%RUNENAME%` on non-rune, `%NL%` where not allowed.
Sprite INVISIBLE (Item.cpp:1100-1110, NewGround/OldGround packet): if any TIER-passing map rule matches → never invisible. Else walks RuleList; any matching rule whose name TEMPLATE (after keyword extraction) is empty, filter level > 0 → INVISIBLE, continuing past %CONTINUE% rules → `{desc}%CONTINUE%` or bare `%CONTINUE%` can make sprite invisible though a later rule names it [verify in-game]. Template merely rendering empty hides label not sprite. INVISIBLE never cleared until re-enters view. Vanilla drop sounds skipped for invisible (984).
Descriptions still show when name hidden (`ItemDisplay[]: {%NAME%}`).
Alt/always-show only force labels to draw; pickup not gated by BH [verify].

## 8. Notifications / icons / sounds / TIER
ParseMapColor 3681: `%KEY-([a-f0-9]{1,4})%` case-insensitive, first match only, hex 0..0xFFFF; invalid & duplicates literal. `DEAD` valid hex = 0xDEAD DEAD_COLOR; `BEEF` = UNDEFINED_COLOR (absent).
TIER `%TIER-([0-9])%` single digit, default -1; TIER-10..12 don't parse (literal) though wiki says 0-12.
SOUNDID 1-4 digits; value ≥ sound record count → 0 (keyword still removed); not parsed inside braces.
Legacy %MAP%: color = among 20 map colors, whose first occurrence is last before %MAP%; default WHITE 0x20; also sets border if undefined; overrides %MAP-xx%.
Notification pass MN:53-116: each ground unit once (NO_EXPERIENCE flag); MapRuleList in order; skip if filterLevel!=0 && tier!=-1 && tier<filterLevel; first remaining match: if not revealed & filter enabled & detailed notifications != 0 (1=all, 2=only new-flag items): play sound if drop sounds on, 0<id<count, not looping, group≠2; print filtered GetItemName (D2Helpers.cpp:355) in quality color truncated 151 bytes; set REVEALED; break regardless of %CONTINUE%.
→ only one rule notifies/sounds; hide/display rules don't suppress (hidden items notify with empty name); notifying rule needn't be display rule; setting 1 re-notifies when unit re-enters view/dropped; setting 0 no print/sound but still revealed.
NOTIFY is a no-op (consumer print code commented out Item.cpp:1076-1098).
Icons MN:118-180: only revealed items; every matching map rule's action drawn (no TIER filter) until first rule with stopProcessing; BORDER 8×8, MAP 6×6, DOT 4×4, PX 2×2. LINE parsed, never drawn (lineColor unused) [PD2 client may draw]. If all matching map rules skipped by TIER → never revealed → no icon (contradicts wiki "TIER-0 keeps icons") [verify in-game].
TIER: notifies if level==0 || no TIER || TIER ≥ level. TIER-9 stops at 10-12. TIER on non-map rule does nothing.

## 9. Caching (RLC.h)
LRU 100 keyed by dwUnitId, fingerprint dwFlags | dwMode<<32 | ItemLocation<<40. NOT keyed: CLVL, stats, class, area, difficulty, vendor. Invalidated: filter level change (Item.cpp:805-814, ChangeFilterLevels 780), game join (621), config reload, flag/mode/location change (identify, socket, pickup, drop), eviction >100, hover (clears when hovered item changes and when previousFlags != pItem->dwFlags 1457-1472 — likely bug → re-eval every tooltip draw). Mutable conditions: labels freeze at first eval; notifications once when first seen; INVISIBLE at packet time; icons from map_action_cache — can disagree.

## 10. Surprises
%RES% 0 unless all four non-zero; failed island literal; digit formula key unprintable; out-of-range SOUNDID can drop rule from MapRuleList; 0xBEEF undefined.

## 11. Emulator mismatches
M1 engine.ts keeps prev.desc when no braces — BH sets "". M2 segmentOutput toggles every {/} — BH first{..first}. M3 %CONTINUE% in braces sets cont — BH literal, no continue. M4 duplicates: emulator last wins & removes all — BH first wins, later literal (CONTINUE, MAP, notify). M5 NOTIFY_RE any alnum — BH hex 1-4 / TIER 1 digit / SOUNDID 1-4 digits. M6 SOUNDID/legacy MAP inside braces parsed — BH literal. M7 legacy %MAP% not modelled as notify — BH sets map+border color from preceding color. M8 SOUNDID-0 / out-of-range counted as notify — BH not map rule. M9 emulator stops at first tier-suppressed rule — BH skips it; next qualifying notifies. M10 map icons not modelled (all matching map rules up to first stopper, no TIER filter, only if revealed). M11 isBlank treats whitespace/color-only as hidden — BH exact "". M12 level-0 follows M11. M13 %NL% always newline — BH nlAllowed/nmagStaffmod. M14 CL/CS eager — BH lazy lookahead. M15 name length: \n excluded, no truncation, 125 — BH counts \n & TRANS, truncates 56 (512 shop), caps 127/123/126. M16 desc 500 constant — BH dynamic ≤512 + "...". M17 SOCK/WIDTH/HEIGHT/AREA/QLVL/ALLSK/GEM/CHSKn render values — BH literal. M18 uppercase every token — BH parity. M19 wrong param count literal in BH. M20 island compile fail f_err — BH literal $f(...). M21 double vs float %.2f. M22 %RES% all-four-nonzero. M23 %STATn%/%SKn% out of range "". M24 tbl colors BASENAME/RUNENAME. M25 spec wording: CORAL/SAGE/TEAL/LIGHT_GRAY/BLACK Glide-only; TRANS D2GL/HD only. M26 sprite INVISIBLE not modelled. M27 NOTIFY inert. M28 lint says "2 hex digits"/TIER 0-12 — BH 1-4 hex, TIER 0-9.

## 12. Lint opportunities (E certain / W likely / I info)
L1 E unknown keyword (%SOCK%, %WIDTH%) literal. L2 E wrong param count. L3 E lowercase keyword after lone % (parity) → literal; %continue% ignored. L4 W literal % → suggest %PERCENT%. L5 E formula key with digit unprintable. L6 E island not compiling → literal. L7 E %CONTINUE% in braces. L8 E second %CONTINUE%/%MAP%/notify keyword literal. L9 E SOUNDID/legacy MAP inside braces. L10 E bad notify value (%MAP-G1%, %SOUNDID-47140%). L11 E TIER-10..12. L12 I NOTIFY no-op. L13 I LINE not drawn by BH [verify]. L14 W TIER on rule without icon/sound. L15 W/E SOUNDID out of range/0/looping/group 2. L16 W color BEEF. L17 W color >0xFF or near-black. L18 W map rule shadowed by earlier hide rule → empty-name notification. L19 W map keyword on a hiding rule. L20 I overlapping map rules, earlier %CONTINUE%: first sound only, icons stack. L21 I earlier tiered map rule overlapping later untiered → later takes over at high levels. L22 W icon-without-text via TIER-0 → no icon unless revealed [verify]. L23 W %CONTINUE% rule with empty name part → sprite invisible [verify]. L24 W %CONTINUE% rule with desc followed by overlapping no-brace rule → desc wiped; suggest {%NAME%}. L25 I %NAME% in braces with no earlier description = "". L26 W space/color-only output meant to hide → not hidden. L27 W output renders empty for some items (%RUNENAME% alone) → unexpected hide. L28 I item-specific keywords on rules matching other items (RUNENAME/RUNENUM non-runes, GEM* non-gems, weapon keys non-weapons, SOCKETS misc, QTY non-stack, PRICE quest). L29 W %NL%/%CL% in names that may match items without NL support. L30 W >1 NL on normal/superior. L31 I leading/trailing CL/CS, CL followed only by color. L32 W name >56 visible (count \n, TRANS). L33 W internal >127. L34 I desc >~400 truncated. L35 E odd braces. L36 I color before %NAME% on built-in-color items. L37 I custom colors fall back outside Glide. L38 I TRANS no-op without HD, cost 3 visible. L39 E output alias lower/mixed case not expanded. L40 I mutable conditions/outputs on display rules freeze labels. L41 W very long output → FILTER REGEX ERROR. L42 I TIER-9 with >9 levels. L43 W %STATn%/%SKn% id out of range → "".
