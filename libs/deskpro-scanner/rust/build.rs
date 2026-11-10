//! Lists every packed struct's layout and every integer constant in `src/ffi.rs`, with the Rust
//! values, for `tests/vendor_header.rs` to check against the installed C header.

use std::fmt::Write as _;

const INTEGER_TYPES: &[&str] = &["u8", "u16", "u32", "u64", "i32", "i64", "usize"];

fn main() {
    println!("cargo:rerun-if-changed=src/ffi.rs");
    let source = std::fs::read_to_string("src/ffi.rs").expect("src/ffi.rs is readable");
    let mut table = String::from(
        "/// `(C expression, Rust value)` for every packed struct size, field offset and integer\n\
         /// constant in `ffi.rs`.\n\
         pub const LAYOUT: &[(&str, i128)] = &[\n",
    );

    let mut lines = source.lines();
    let mut packed = false;
    while let Some(line) = lines.next() {
        if line == "#[repr(C, packed)]" {
            packed = true;
        } else if let Some(rest) = line.strip_prefix("pub struct ").filter(|_| packed) {
            packed = false;
            let name = rest.trim_end_matches(" {");
            writeln!(
                table,
                "    (\"sizeof({name})\", size_of::<{name}>() as i128),"
            )
            .expect("writing to a String");
            for field in lines.by_ref().take_while(|line| *line != "}") {
                if let Some((field, _)) = field
                    .trim()
                    .strip_prefix("pub ")
                    .and_then(|f| f.split_once(':'))
                {
                    writeln!(
                        table,
                        "    (\"offsetof({name}, {field})\", std::mem::offset_of!({name}, {field}) as i128),"
                    )
                    .expect("writing to a String");
                }
            }
        } else if let Some(name) = line
            .strip_prefix("pub const ")
            .and_then(|rest| rest.split_once(": "))
            .filter(|(_, rest)| {
                INTEGER_TYPES.contains(&rest.split([' ', '=']).next().unwrap_or_default())
            })
            .map(|(name, _)| name)
        {
            writeln!(table, "    (\"{name}\", {name} as i128),").expect("writing to a String");
        }
    }
    table.push_str("];\n");

    let out = std::path::PathBuf::from(std::env::var_os("OUT_DIR").expect("cargo sets OUT_DIR"));
    std::fs::write(out.join("vendor_header_layout.rs"), table).expect("OUT_DIR is writable");
}
