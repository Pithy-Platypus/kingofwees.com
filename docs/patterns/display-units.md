# Display units: feet and miles, not from the locale

Rule: `source/frontend/CLAUDE.md` — distances shown to people are US customary (feet, then miles).

## What happened

Slice 3's heat map named blocks with no spot nearby by their distance from the closest spot. The first version formatted metres ("About 550 m from Elm & Earle"). King's neighbors are in the US; Wallie's manual test flagged it at once. Nothing failed: `intl.formatNumber(550, { style: 'unit', unit: 'meter' })` renders correctly in every locale, so no test or type-check could object.

## The rule as built

`imperial()` in `source/frontend/src/king/heat.ts`: feet rounded to 50 under a quarter mile (1,320 ft), then miles to a tenth. Blocks are ~110 m, so "near" (≤ 150 m, about a block) never needs a number at all — only farther places do.

## Rejected

- **Units from the locale.** `Intl` formats a unit you choose; it never chooses one. Deriving metric vs imperial from `en-US` vs `en-GB` would be hand-rolled guessing, and every visitor today is one street in the US.
- **Metres with a feet fallback for `en-US`.** Two code paths for one audience.

Revisit when people can choose their own formats (accounts, or a setting kept in the browser).
