# Vendored translations playbook

How to add or fix a language in
`libs/backend/src/language_and_audio/vendored_translations.json`, using UAT
(usability / user-acceptance testing) feedback. First done for Spanish and
Chinese in #9164, then for Russian after the September 2026 Russian/Vietnamese
UAT. Repeat this for each new language.

## How vendored translations work

- The file maps a language code to
  `{ "<English source text>": "<translation>" }`. There are no string IDs:
  lookup is by exact English text, so one entry applies everywhere that English
  appears (VxMark, VxMarkScan, VxScan UI, the printed HMPB ballot, and
  election-definition content such as party names).
- `apps/design/backend/src/translator.ts` consults vendored translations **ahead
  of** the cloud translation cache and the Google Translate API. Only a
  jurisdiction's explicit per-string edits in VxDesign rank higher. A vendored
  entry therefore permanently replaces the machine translation for that English
  text, and never self-corrects.
- The translations are baked into the election package at export time
  (`uiStrings` / `appStrings.json`, HMPB `ballotStrings`) and are what the
  text-to-speech engine reads aloud. Every mistake is both visible and audible.
- The English text of every app string lives in
  `libs/ui/src/ui_strings/app_strings.tsx`; the generated catalog
  `libs/ui/src/ui_strings/app_strings_catalog/latest.json` gives the
  `id -> English` map. HMPB strings are in `libs/hmpb/src/hmpb_strings.tsx`.
- An empty-string vendored value is treated as "not vendored" (the translator
  checks truthiness), so never leave placeholders.

The language must exist in `LanguageCode` (`libs/types/src/language_code.ts`)
and have a TTS voice in
`libs/backend/src/language_and_audio/speech_synthesizer.ts`. As of 2026-09
Russian, Vietnamese, Urdu, Tagalog, Hindi, Hmong, Japanese, Khmer and Korean
exist only on the `ca-demo` branch, not on `main`.

## Inputs to collect

1. **The UAT build's translations.** Export the election package used for UAT
   and keep its `appStrings.json` (keys `en`, `<lang>`, ...). This gives you the
   machine translation the tester actually saw, keyed by string ID, and the
   exact English text to key the vendored entries by.
2. **The tester's notes.** Usually informal ("'Next' should be 'forward'",
   "'contest' reads like a competition"). Each note names a screen and an
   approximate English phrase; you must map it to string IDs yourself.
3. **Reference material for the language.** Real bilingual ballots or election
   glossaries from US jurisdictions that print in the language (for #9164: Santa
   Clara County ballots and the EAC Spanish glossary). Prefer their terminology
   over dictionary translations.

## Procedure

1. **Work in a worktree off the branch that has the language code** (`ca-demo`
   today for the new languages). Check the vendored file, schema and test on
   that branch: they can lag `main` (ca-demo still has the pre-#9164
   Chinese/Spanish values and the old test).
2. **Build the working set.** Join the vendored key set against the catalog by
   English text. Expect three groups:

   - keys that are current app strings (get the UAT machine translation as a
     baseline);
   - keys that are HMPB ballot strings or fixture-election content ("Harris
     County", "Proposition 1"): no baseline, translate from scratch;
   - current app strings **not** in the vendored key set (in 2026-09 there were
     125: the voter help screens, party selection, volume/rate labels, scanner
     titles). These ship the raw cloud translation unless you add them.

   Only add **app strings** (and HMPB template strings). Never add new election
   content (contest titles, party names, county names, measure text): that is
   per-election data and belongs to the cloud translation or the jurisdiction's
   own edits. The Texas UAT election content already in the shared set is
   translated for new languages only because the test requires covering the
   reference set; do not extend it. The Russian pass added the 125 current app
   strings on top of the shared set (644 keys). The test allows a language to be
   a superset of the Spanish reference set, never a subset.

3. **Locate every string in the UI before translating it.**
   `grep -rn "appStrings.<id>"` across `apps/*/frontend/src`, `libs/ui/src` and
   `libs/mark-flow-ui/src`. What matters: is it a button label, a title, a
   screen-reader-only prefix (`labelSelected`, `labelDeselectedOption` are audio
   prefixes read before the option name), a scroll control (`buttonMore` is used
   for both scroll directions), or printed on paper (`labelNumVotesUnused`
   appears on the BMD paper ballot too)? Buttons need imperatives or short
   nouns; audio prefixes need to read naturally before a candidate name; printed
   text must be neutral.
4. **Fix terminology as a system, not per string.** Decide once for the whole
   language and apply consistently: contest, ballot, cast, write-in, review,
   poll worker, precinct, the accessible-controller button names, the PAT
   "move"/"select" inputs, volume, rate of speech, text-to-speech. Machine
   translation is inconsistent here (Russian had three renderings of "write-in"
   and translated "party" as a celebration). Quoted control names inside
   instruction text must match the actual button labels
   (`voterHelpScreenContentWriteInScreenDone` quotes "Accept" and "Cancel"; the
   PAT instructions quote "next", "back", "done", "print my ballot").
5. **Map every tester note to string IDs and record the outcome**: fixed,
   already correct, or out of scope (election content, audio ordering, UI copy).
   Notes about audio ordering ("it says 'Selected option, Question B, No'") are
   code structure, not translation.
6. **Keep the keyboard letters Latin.** Write-in names are entered in Latin
   script; `letterA`..`letterZ` are vendored as themselves in every language.
   The machine translation had transliterated them.
7. **Validate before committing.** `vendored_translations.test.ts` checks that
   every non-empty language covers the Spanish reference key set and that
   nothing is empty. On `main` (since #9164) it also checks that `<1>`-style
   interpolation tags match the English, that no trailing sentence was dropped,
   that there are no leading numbering artifacts and no doubled CJK punctuation.
   `ca-demo` still carries the pre-#9164 Chinese values that fail those four
   checks, so they are not on that branch; run the same checks with a script
   against your new block before committing, and port the tests when #9164 lands
   on the branch. Run from `libs/backend`:

   ```sh
   pnpm test:run src/language_and_audio/vendored_translations.test.ts
   ```

   Gotchas: a fresh worktree installed with `--ignore-scripts` lacks native
   modules (`canvas`); copy
   `node_modules/.pnpm/canvas@<v>/node_modules/canvas/build` from the main
   checkout. Do not add a "translation differs from English" check: cognates
   such as Spanish `Audio` are legitimately identical. ESLint 8 ignores files
   under the dot-folder worktree path, so lint the test file from a copy in the
   main checkout.

8. **Regenerate fixtures if the language is in a fixture election.** #9164 had
   to regenerate `libs/fixtures`, `libs/hmpb`, `libs/bmd-ballot-fixtures` and
   VxDesign test-deck snapshots because Spanish/Chinese are baked into fixture
   election packages. A language that no fixture election uses (Russian,
   Vietnamese today) needs no regeneration.
9. **Write the PR so a native speaker can review it.** Put the terminology
   decisions and the tester-note mapping in the description, and a full English
   / machine / vendored table as an attachment or review comments. Flag the
   judgment calls you are least sure of.

## Known gaps

- The Spanish reference key set is stale: it contains obsolete strings
  ("Printing Your Official Ballot...", "1. Verify your official ballot.") and
  lacks 125 current app strings. Refreshing it means adding those strings for
  Spanish and both Chinese variants in one PR.
- Vendored lookup cannot distinguish a "No" button from a "No" measure option
  (#9162).
- Contest-option audio order ("Selected option: Question B: No") was flagged by
  both the Russian and Vietnamese testers; it is a code change, not a
  translation.
