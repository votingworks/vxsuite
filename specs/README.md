# Specs

This directory contains engineering design documents (specs) for significant
features, infrastructure updates, and other large changes to VxSuite.

Specs serve as a shared artifact for discussing the _why_ and _how_ of changes
before or alongside implementation. They are reviewed and merged via pull
requests.

## When to write a spec

Write a spec when:

- You do not already have a clear implementation plan.
- The design involves non-obvious trade-offs that warrant discussion.
- The change would change established conventions in VxSuite.

Small, self-contained bug fixes and routine feature work generally do not need
specs. It's expected that one spec PR will likely be followed by several code
PRs that actually implement the change.

## Lifecycle

Spec PR status itself signals spec status:

- **Open PR** — under discussion / a draft
- **Merged** — accepted / the initial approach is settled
- **Closed without merging** — rejected / abandoned

## PR workflow

Specs can live in the same PR as the implementation or in a separate PR — use
your judgment based on scope. For large or cross-cutting changes, a spec-only PR
first is encouraged so the design can be reviewed and settled before
implementation begins. Reference the spec PR from any implementation PRs that
follow.

## File naming

```
specs/<number>-<slug>.md
```

- `<number>` is a zero-padded four-digit sequence number (e.g. `0001`)
- `<slug>` is a short, lowercase, hyphen-separated description
- The sequence number is assigned by incrementing from the highest existing
  number at the time of authoring

Examples:

```
0001-writing-specs.md
0002-some-other-thing.md
```

## Document structure

Specs do not have a rigid template, but the following sections work well for
most changes. Include the sections that are useful and omit the rest.

```markdown
# Title

**Author:** @github-handle

## Existing Discussion

<!-- Links to GitHub issues, Slack discussion, etc. -->

## Problem

<!-- What is broken, painful, or missing? Why does it need to change now? -->

## Proposal

<!-- What are you building or changing, and how does it work? -->

## Alternatives considered

<!-- What other approaches did you evaluate, and why did you choose this one? -->

## Open questions

<!-- Decisions or unknowns to be resolved during review. -->
```
