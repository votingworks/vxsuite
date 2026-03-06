# Specs

This directory contains engineering design documents (specs) for significant
features, infrastructure updates, and other large changes to VxSuite.

Specs serve as a shared artifact for discussing the _why_ and _how_ of changes
before or alongside implementation. They are reviewed and merged via pull
requests. While a project is ongoing, they can be thought of as a living
document reflecting the current plan. Afterward, they enter the historical
record and may no longer reflect the current status of VxSuite. The code
ultimately serves as the source of truth for completed specs.

## When to Write a Spec

Write a spec when:

- You do not already have a clear implementation plan.
- The design involves non-obvious trade-offs that warrant discussion.
- The change would change established conventions in VxSuite.

Small, self-contained bug fixes and routine feature work generally do not need
specs. It's expected that one spec PR will likely be followed by several code
PRs that actually implement the change.

## Lifecycle

Specs indicate their status using a field near the top of the document. The
status is one of:

- `planning` — still undergoing refinement and not yet ready to start
  implementation
- `implementing` — initial plan is settled and code PRs are forthcoming
- `completed` — implementation has completed, and further work will happen with
  a new spec or is likely small fixups
- `rejected` — the plan was rejected, but the rationale for it being rejected is
  useful to have for reference

Rejected spec PRs can also just be closed without merging rather than being
marked `rejected` if their inclusion is not deemed useful.

## PR Workflow

Specs can live in the same PR as the implementation or in a separate PR — use
your judgment based on scope. For large or cross-cutting changes, a spec-only
`planning` spec PR first is encouraged so the plan can be reviewed and settled
before implementation begins. Reference the `implementing` spec from any
implementation PRs that follow.

While the spec is `planning` or `implementing`, you should update the spec
document as the plan changes. Once the project is complete, consider filling out
the "Wrap-up / Retro" section of the spec and mark the spec as `completed`. At
this point, the spec is no longer expected to reflect the current reality of the
codebase and should be thought of a historical document.

## File Naming

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

## Document Structure

Specs do not have a rigid template, but the following sections work well for
most changes. Include the sections that are useful and omit the rest.

```markdown
# Title

**Author:** @github-handle

**Status:** `planning`

## Existing Discussion

<!-- Links to GitHub issues, Slack discussion, etc. -->

## Problem

<!-- What is broken, painful, or missing? Why does it need to change now? -->

## Proposal

<!-- What are you building or changing, and how does it work? -->

## Alternatives Considered

<!-- What other approaches did you evaluate, and why did you choose this one? -->

## Open Questions

<!-- Decisions or unknowns to be resolved during review. -->

## Wrap-up / Retro

<!-- At the end of the project, add any notes here about what changed and why. -->
```
