# Writing Specs in VxSuite

**Author:** @eventualbuddha

## Existing Discussion

- [Initial Slack proposal](https://votingworks.slack.com/archives/C085YT4798C/p1772731917119609)
- [RFD 1 Requests for Discussion at Oxide](https://oxide.computer/blog/rfd-1-requests-for-discussion)

## Problem

VxSuite has grown in scope and complexity, as have the projects we're taking on
as a company. Significant technical decisions — architectural changes, new
infrastructure patterns, large feature designs — have historically been
discussed in Slack threads, Google Docs, or implicitly in code review. This
makes it difficult to:

- Find the reasoning behind past decisions.
- Provide structured feedback before implementation is underway.
- Onboard new contributors/LLMs to why things work the way they do.

We want a lightweight place for engineering design discussion that lives in the
repo alongside the code.

## Proposal

Adopt a practice of writing short design documents (specs) for significant
features, infrastructure updates, and other changes. Specs are stored in the
`specs/` directory at the repo root and reviewed via pull requests using the
"spec" PR template. See [`specs/README.md`](README.md) for naming conventions,
lifecycle, and document structure. The README should evolve over time and
diverge from this document, assuming this practice catches on.

## Alternatives Considered

**Slack channels/threads.** Slack is great for immediacy and informality, but
isn't public and can be hard to search. Even when a decision is recorded, the
reasoning is not always clear due to the casual nature of the medium.

**Google Docs.** This is mostly what we have used when writing engineering
design documents. It works, but the documents tend to be forgotten once the
initial design is settled. Like with Slack, finding the rationale for decisions
among Google Docs can be quite challenging. Historically, they've also been
non-public. Creating public Google Docs is an option, but a mix of public and
private docs often leads to access control confusion.

**GitHub issues as the discussion venue.** Issues are already used for bug
tracking and feature requests and are familiar to contributors. However, issues
are harder to edit collaboratively, don't benefit from PR review tooling (inline
comments, suggestions), and are decoupled from the code that implements them.

**An external wiki or Notion.** A shared wiki can host richer content but is
disconnected from the repo, has separate access controls, and tends to be
forgotten. Keeping specs in-repo ensures they are accessible, searchable with
standard tools, and visible to anyone who can read the code.

## Open Questions

None.
