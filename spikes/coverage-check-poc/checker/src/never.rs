// Never-param registry: scan source trees for function declarations with a
// required parameter syntactically typed `never`. Registry is by exported
// name; call-site resolution (imports/local decls) happens per-file in
// classify.rs. Parse-time only — no type checker.

use std::collections::HashSet;
use std::path::Path;

use oxc_allocator::Allocator;
use walkdir::WalkDir;

use crate::attach::parse_file;

pub fn source_files(dir: &Path) -> Vec<std::path::PathBuf> {
    WalkDir::new(dir)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !(e.file_type().is_dir()
                && (name == "node_modules" || name == "build" || name == "coverage"))
        })
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.into_path())
        .filter(|p| {
            let name = p.file_name().unwrap_or_default().to_string_lossy();
            (name.ends_with(".ts") || name.ends_with(".tsx"))
                && !name.ends_with(".test.ts")
                && !name.ends_with(".test.tsx")
                && !name.ends_with(".d.ts")
        })
        .collect()
}

pub fn build_registry(scan_dirs: &[&Path]) -> HashSet<String> {
    let mut names = HashSet::new();
    for dir in scan_dirs {
        for path in source_files(dir) {
            let Ok(text) = std::fs::read_to_string(&path) else { continue };
            // Cheap pre-filter before parsing.
            if !text.contains(": never") {
                continue;
            }
            let allocator = Allocator::default();
            let parsed = parse_file(&allocator, &path, &text);
            for decl in &parsed.collected.fn_decls {
                if decl.has_required_never_param {
                    names.insert(decl.name.clone());
                }
            }
        }
    }
    names
}
