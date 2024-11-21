## Rust Best Practices

We follow the
[Rust Style Guide](https://doc.rust-lang.org/nightly/style-guide/), with most of
it enforced by `rustfmt` and `clippy`.

We believe our code to meet all of the recommendations in the Rust Style Guide
published as of November 21, 2024. A link to the guide as of that date is kept
[here](https://github.com/rust-lang/rust/blob/717f5df2c308dfb4b7b8e6c002c11fe8269c4011/src/doc/style-guide/src/SUMMARY.md)
for reference.

## Tooling

### Rustup

We use [`rustup`](https://rustup.rs/) to manage our Rust installation. It
installs the Rust compiler, `cargo`, and other tools. This should already be
installed on your machine if you're using the pre-built images.

You can update your Rust installation like this:

```sh
rustup update
```

### Rust Analyzer

We use [`rust-analyzer`](https://rust-analyzer.github.io/) for IDE support. See
the [IDE Setup](#ide-setup) section for more information.

### Cargo

We use [`cargo`](https://doc.rust-lang.org/cargo/) to manage our Rust
dependencies and build our projects.

### IDE Setup

We recommend using [Visual Studio Code](https://code.visualstudio.com/) with the
[`rust-analyzer` extension](https://marketplace.visualstudio.com/items?itemName=matklad.rust-analyzer).
This should provide you with most of the features you need, including code
completion, formatting, and linting.

### Formatting

We use `cargo fmt` to format our code. You can run it manually like this:

```sh
cargo fmt
```

Though we recommend using IDE integration, which should automatically format
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
bacon        # watches and runs `cargo check`
bacon clippy # watches and runs `cargo clippy`
bacon test   # watches and runs `cargo test`
```

## Learning

If you're new to Rust, we recommend the following resources:

- [The Rust Programming Language](https://doc.rust-lang.org/book/)
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/)
- [Rust Playground](https://play.rust-lang.org/)

### Rust for TypeScript Developers

If you're already familiar with TypeScript, you may find the following resources
helpful:

- [How to learn Rust as a JavaScript Developer effectively?](https://www.reddit.com/r/rust/comments/ymw40t/how_to_learn_rust_as_javascript_developer/)
- [Rust for JavaScript Developers (paid)](https://rustforjs.dev/)

### Rust Basics

Rust is a compiled language. It's similar to C++ in that it's a low-level
language that gives you a lot of control over memory management. However, it
also has a lot of high-level features that make it easier to write safe code.

Rust is a statically-typed language. This means that the compiler will check
your code for errors before you run it. Rust is quite strict, but this
strictness catches a lot of bugs at compile-time that you'd encounter at runtime
in other languages, such as memory safety issues or data races. This is
different from JavaScript and TypeScript, which are dynamically-typed languages.

#### Ownership

Rust uses a concept called "ownership" to manage memory. Ownership is a
different way of thinking about memory management than you may be used to. It
can be a bit confusing at first, but it's one of the most important concepts in
Rust.

Ownership is a way of tracking which parts of your code "own" a piece of data.
When a piece of data is owned by a part of your code, that part of your code is
responsible for cleaning up that data when it's no longer needed. This is
different from JavaScript and TypeScript, where the garbage collector
automatically cleans up data when it's no longer needed.

Ownership is a way of enforcing the "single writer principle". This means that
only one part of your code can write to a piece of data at a time. In Rust
terms, data can either have one mutable reference at a time, or any number of
immutable references at a time.

```rust
// declare a mutable String
let mut s = String::from("hello");

// create an immutable reference to `s`
let r1 = &s;

// create another immutable reference to `s`
let r2 = &s;

// create a mutable reference to `s`
let r3 = &mut s;
// error: cannot borrow `s` as mutable more than once at a time
```

Developers new to Rust will often encounter errors like this. Addressing these
errors is a matter of understanding ownership and how to work with it. Sometimes
you'll want to refactor your code, and sometimes you'll want to use a different
method of passing data like a simple
[`Copy`](https://doc.rust-lang.org/std/marker/trait.Copy.html) or
[`Clone`](https://doc.rust-lang.org/std/clone/trait.Clone.html), or a more
advanced technique like
[`Arc`](https://doc.rust-lang.org/std/sync/struct.Arc.html) or
[`Rc`](https://doc.rust-lang.org/std/rc/struct.Rc.html).

#### Structs

Rust has a concept called "structs", which are similar to classes in other
languages. Structs are a way of grouping related data together. They can also
have methods, which are functions that operate on the data in the struct.

```rust
struct User {
    username: String,
    email: String,
    sign_in_count: u64,
    active: bool,
}

impl User {
    fn new(username: String, email: String) -> Self {
        Self {
            username,
            email,
            sign_in_count: 0,
            active: false,
        }
    }

    fn sign_in(&mut self) {
        self.sign_in_count += 1;
    }
}
```

Note that structs do not have inheritance. Instead, you can use
[traits](https://doc.rust-lang.org/book/ch10-02-traits.html) to implement
interfaces.

#### Enums

Rust has a concept called "enums", which are similar to tagged unions in other
languages. Enums are a way of grouping related data together. They can also have
methods, which are functions that operate on the data in the enum.

```rust
enum IpAddr {
    V4(u8, u8, u8, u8),
    V6(String),
}

/// Implement the `Display` trait for `IpAddr`.
impl Display for IpAddr {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::V4(a, b, c, d) => write!(f, "{a}.{b}.{c}.{d}"),
            Self::V6(s) => write!(f, "{s}"),
        }
    }
}

// now we can use `IpAddr` like this:
let ip_addr = IpAddr::V4(127, 0, 0, 1);
println!("IP address: {ip_addr}"); // prints "IP address: 127.0.0.1"
```

#### Matching

Rust has robust pattern matching, which acts like a more powerful version of
JavaScript's destructuring. The most common pattern matching happens with the
`match` keyword to match on enums. This is similar to a `switch` statement in
other languages. Note the use of `match` in the example above.

Other patterns include `if let` and `while let`, which are useful for matching
on a single case of an enum.

```rust
let some_number = Some(5);

// `if let` match destructures `some_number` into `n` if it matches `Some(n)`
if let Some(n) = some_number {
    println!("{n}");
}

// `if let` match with a literal
if let Some(5) = some_number {
    println!("five");
}
```

### `Result` and `Option`

Rust has two types that are used to represent the possibility of failure:
[`Result`](https://doc.rust-lang.org/std/result/enum.Result.html) and
[`Option`](https://doc.rust-lang.org/std/option/enum.Option.html).

`Result` is used to represent the possibility of failure in a function. It has
two variants: `Ok` and `Err`. `Ok` is used to represent success, and `Err` is
used to represent failure. `Result` is used in functions that can fail, such as
functions that read from a file or make a network request.

```rust
// `read_file` returns a `Result` because it can fail
fn read_file(path: &str) -> Result<String, std::io::Error> {
    // `std::fs::read_to_string` returns a `Result` because it can fail
    std::fs::read_to_string(path)
}
```

`Option` is used to represent the possibility of failure in a value. It has two
variants: `Some` and `None`. `Some` is used to represent a value, and `None` is
used to represent the absence of a value. `Option` is used in functions that
return a value that may or may not exist, such as functions that look up a value
in a map.

```rust
// `get` returns an `Option` because it may not find a value
fn get(key: &str) -> Option<String> {
    match key {
        "foo" => Some("bar".to_string()),
        _ => None,
    }
}
```

Both of these types are used extensively in Rust code. There's a handy shortcut
for unwrapping `Result` and `Option` values called the `?` operator. It's
similar to `try`/`catch` in other languages.

```rust
fn main() -> Result<(), std::io::Error> {
    // returns early if `read_file` returns an `Err`
    // if it's an `Ok`, then `contents` will have the unwrapped value
    let contents = read_file("foo.txt")?;

    println!("Got contents: {contents}");

    Ok(())
}
```

Note that `?` can only be used in functions that return `Result` or `Option`,
and only can be used with either `Result` or `Option` in a single function.
There are often convenient ways to convert between `Result` and `Option` if you
need to do so.

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
