# Research notes

Raw findings behind [../PD2-Filter-Engine-Reference.md](../PD2-Filter-Engine-Reference.md). Each was produced by reading PD2's open-source filter engine, [Project-Diablo-2/BH](https://github.com/Project-Diablo-2/BH), at commit `662229b6` (2026-07-14), with `File:line` citations.

- `findings_A_parsing.md`: file loading, line syntax, aliases, tokenizing, precedence and rule lists.
- `findings_B_conditions.md`: what every condition keyword actually checks.
- `findings_C_output.md`: output keywords, colors, descriptions, hiding, notifications and caching.
- `findings_D_formulas.md`: the formula engine (Formula.h), variables, islands and rendering.

The ecosystem research (launcher, feature history, wiki corrections, community pitfalls) is folded into sections 2 and 19–21 of the reference.

Each finding lists **emulator mismatches** that were fixed in `src/lib/` and **lint opportunities** that became the checks in `src/lib/lint.ts`.
