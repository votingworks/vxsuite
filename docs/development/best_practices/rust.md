# Rust Style Guide

We follow the
[Rust Style Guide](https://github.com/rust-lang/style-team/blob/02f3c00c06c6609e3e0add3f2f15f448e12b709a/guide/guide.md),
with most of it enforced by `rustfmt` and `clippy`.

<!--
  NOTE: we pinned the revision of the Rust Style Guide above to clarify expectations
  when certifying. There's no reason we can't update it, but it should remain pinned to
  a specific revision.
-->

## Basics

### IDE Setup

We recommend using [Visual Studio Code](https://code.visualstudio.com/) with the
[`rust-analyzer` extension](https://marketplace.visualstudio.com/items?itemName=matklad.rust-analyzer).
This should provide you with most of the features you need, including code
completion, formatting, and linting.

### Formatting

We use `rustfmt` to format our code. You can run it manually like this:

```sh
rustfmt path/to/file.rs
```

Though we recommend IDE integration, which should run `rustfmt` automatically
when you save a file.

### Linting

We use `clippy` to lint our code. You can run it manually like this:

```sh
cargo clippy
```

### Testing

We use `cargo test` to run our tests. You can run it manually like this:

```sh
cargo test
```

### Automatic Linting and Testing

Install the `bacon` tool:

```sh
cargo install bacon
```

Then run it in the root of the project:

```sh
bacon
```

It will watch for changes and automatically run `clippy` or `cargo test`,
depending on which mode you're in.

## Should I write my new feature in Rust?

When writing a new feature, consider Rust if:

- it's performance-critical.
- there is better tooling (i.e. crates) for it than in TypeScript.
- it is not a web app (though it can be a library used by a web app).

It's likely that most new code should be TypeScript at this point, but there are
good reasons to choose Rust. If you're not sure, ask in the
[#vxsuite-prodeng](https://votingworks.slack.com/archives/CEL6D3GAD) channel on
Slack or ask in a
[new issue](https://github.com/votingworks/vxsuite/issues/new).
