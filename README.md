# PDI Driver Demo

1. Ensure you have Rust installed (via [`rustup`](https://rustup.rs/) is best).
2. Clone this repository.
3. Connect the PageScan 6D scanner.
4. Run `cargo run --example get_test_string` to run the simplest test to establish that scanner communication works.
5. Run `cargo run --example scan_forever` to run the scan example program. It will scan a single sheet and eject it out the front, writing the images to disk in the working directory. It will be a bit slow in debug mode (the default), so you can add `--release` to speed it up.
