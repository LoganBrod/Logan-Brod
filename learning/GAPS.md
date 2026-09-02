# Gaps

Things I could not explain. Oldest first - the top of this list is what gets
taught next. An item leaves only when I explain it correctly, unprompted,
about different code than where it came from.

| Date | Gap | Where it came up | Status |
|---|---|---|---|
| 2026-08-30 | Tracing a function line by line instead of guessing from its name | `appendPicks`, `pickCapFor` | open - the root one |
| 2026-08-30 | Mobile-first breakpoints: `sm:` applies *from* 640px up, unprefixed is the phone value | `sm:grid-cols-2`, `sm:text-[2.9rem]` | open - failed twice |
| 2026-08-30 | Flex direction: `flex` is a row, `flex-col` replaces that with a column | `AccountBar` | open |
| 2026-08-30 | The ternary: `condition ? ifTrue : ifFalse` | `pickCapFor` | open |
| 2026-08-30 | Reading what code *guarantees* vs what it appears to do | `Math.max(peak, raw)` in `RunProgress` | open |
| 2026-08-30 | Denormalised data: storing a record once and referencing it by id | Closet items copied into every closet | open - taught, not yet demonstrated |
| 2026-08-30 | Which element a CSS change actually affects | `bg-room-ink text-white` button | open |
| 2026-08-30 | [deferred] The clozet-to-accessories bridge, built but not taught: `{code && <MatchPrompt/>}` guard, `resolveCloset` explicit-vs-fallback, `useSearchParams` seeding, feeding `whyItFits` into the cologne prompt | Phase 2 on commit e610fa7, quiz stopped at question 1 | deferred - learn mode turned off mid-lesson |
| 2026-08-30 | [deferred] Conditional render `{code && <X/>}`: what shows when saving fails - quiz stopped at Q1 of 5 when the build pivoted | `StyleRunner` MatchPrompt guard | deferred - resume with the same question |
| 2026-08-30 | [deferred] `resolveCloset`: why an explicit code that misses is "expired" and never falls back to newest | `lib/closetRef.ts` | deferred |
| 2026-08-30 | [deferred] `useSearchParams` reading a link into initial state, and why it is a starting position not a lock | `AccessoryFinder`, `CologneDesk` | deferred |
| 2026-08-30 | [deferred] The first-visit quiz: why closing counts as done, and why it never opens without Redis | `OnboardingQuiz`, `StyleRunner` | deferred |

