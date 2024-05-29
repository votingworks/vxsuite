# Fixture ballots for tests

These ballot images will soon be replaced with generating ballot images on the
fly during tests: https://github.com/votingworks/vxsuite/issues/4889

To regenerate these ballot images before that happens:

0. Modify `printBallot()` in `backend/src/app.ts` to save `pdfData` to disk eg.
   with `fs`.
1. Run the app on real hardware or on a VM with `USE_MOCK_PAPER_HANDLER` set to
   `true` in your `.env.local`
2. Load the election you want to print a mock ballot for
3. Start a voter session, make your selections, and click "Print". You may need
   to temporarily modify the state machine to skip to the
   `waiting_for_ballot_data` state.
