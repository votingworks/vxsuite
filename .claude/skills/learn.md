---
description: Learn from user feedback — either edits they made to code or suggestions in their messages about how to improve code.
---

# Learn from Feedback

When the user provides feedback on code that Claude wrote or modified, extract
lessons to improve future work. Feedback can come in two forms:

- **Direct edits** — the user modified files that Claude previously changed.
- **Verbal suggestions** — the user describes in a message how code should be
  revised (e.g. "you should use X instead of Y", "this should be a switch
  statement").

## Steps

1. **Understand the feedback.** For direct edits, read the current file and
   compare against what was previously written using `git diff` or conversation
   context. For verbal suggestions, identify the specific code patterns or
   changes the user is recommending.

2. **Identify the lessons.** For each piece of feedback, understand *why* the
   user prefers it. Categorize each lesson:
   - **Team convention** — a pattern or rule the whole team follows. These belong
     in `CLAUDE.md`.
   - **Personal preference** — something specific to this user or a useful
     pattern worth remembering. These belong in auto memory (`MEMORY.md`).
   - **Already known** — something Claude should already know from existing
     instructions. No action needed, but acknowledge it.

3. **Report the lessons.** Summarize what was learned and how each lesson is
   categorized. Ask the user to confirm the categorization before saving.

4. **Save the lessons.** Apply confirmed changes:
   - For team conventions: Edit `CLAUDE.md` to add the rule in the appropriate
     section.
   - For personal preferences: Edit `MEMORY.md` to record the pattern.
   - For already-known items: No file changes needed.

5. **Apply the feedback.** If the feedback was a verbal suggestion and the code
   hasn't been changed yet, apply the suggested changes to the code.
