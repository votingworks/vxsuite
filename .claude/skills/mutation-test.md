---
description: Introduce an intentional bug in source code to verify a test catches it, then revert the bug.
---

# Mutation Test

Verify that a test actually catches bugs by introducing an intentional mutation
in the source code under test, running the test to confirm it fails, then
reverting the mutation.

## Steps

1. **Identify the source code to mutate.** Ask the user which code to mutate, or
   infer from context (e.g. the test file being discussed). Read the source file.

2. **For new tests, verify the test passes first.** If the test was just
   written (not modifying an existing test), run it once to confirm it passes
   before introducing a mutation.

3. **Introduce a small, targeted bug.** Examples:
   - Off-by-one error (e.g. change `range(0, n)` to `range(0, n - 1)`)
   - Swap two values (e.g. swap yes/no option IDs)
   - Remove an item (e.g. drop a candidate from a list)
   - Change a condition (e.g. flip `>` to `<`)

   Use the Edit tool to make the change. Keep the mutation minimal — one logical
   change only. **Tell the user what mutation you chose** so they can evaluate
   whether it's a meaningful test.

4. **Run the test.** Use `pnpm test:run <file> -t "<test name>"` from the
   relevant package directory. Do NOT use watch mode.

5. **Verify the test fails.** If the test fails, the mutation was caught —
   report what failed and why. If the test passes, the test has a gap — report
   what mutation was not caught so the user can improve the test.

6. **Revert the mutation.** Undo the edit to restore the original source code.
   Confirm the test passes again after reverting.
