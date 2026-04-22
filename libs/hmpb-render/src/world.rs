use std::collections::HashMap;
use std::path::Path;

use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime};
use typst::syntax::{FileId, Source, VirtualPath};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};

/// A minimal World implementation for compiling Typst ballots.
///
/// Pre-loads fonts and provides file access for the template and data files.
/// Designed to be constructed once and reused across multiple compilations
/// by updating the source/inputs between calls.
pub struct BallotWorld {
    /// The main source file (ballot.typ with inputs substituted)
    main_source: Source,
    /// Additional files accessible to the template (JSON data, SVGs, etc.)
    files: HashMap<FileId, Bytes>,
    /// Font book for font resolution
    book: LazyHash<FontBook>,
    /// Loaded fonts
    fonts: Vec<Font>,
    /// The standard library
    library: LazyHash<Library>,
    /// The main file ID
    main_id: FileId,
}

impl BallotWorld {
    /// Create a new BallotWorld with the given font directory.
    pub fn new(font_dir: &Path) -> Result<Self, String> {
        let mut book = FontBook::new();
        let mut fonts = Vec::new();

        // Load all .ttf/.otf fonts from the font directory
        if font_dir.is_dir() {
            for entry in std::fs::read_dir(font_dir).map_err(|e| format!("Cannot read font dir: {e}"))? {
                let entry = entry.map_err(|e| format!("Font dir entry error: {e}"))?;
                let path = entry.path();
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if ext == "ttf" || ext == "otf" || ext == "woff2" {
                        let data = std::fs::read(&path)
                            .map_err(|e| format!("Cannot read font {}: {e}", path.display()))?;
                        let bytes = Bytes::new(data);
                        for i in 0.. {
                            if let Some(font) = Font::new(bytes.clone(), i) {
                                book.push(font.info().clone());
                                fonts.push(font);
                            } else {
                                break;
                            }
                        }
                    }
                }
            }
        }

        let main_id = FileId::new(None, VirtualPath::new("/ballot.typ"));
        let main_source = Source::new(main_id, String::new());

        Ok(Self {
            main_source,
            files: HashMap::new(),
            book: LazyHash::new(book),
            fonts,
            library: LazyHash::new(Library::default()),
            main_id,
        })
    }

    /// Set the main Typst source code for compilation.
    pub fn set_source(&mut self, source: &str) {
        self.main_source = Source::new(self.main_id, source.to_string());
    }

    /// Register a virtual file accessible to the template (e.g. JSON data, SVGs).
    pub fn add_file(&mut self, path: &str, data: Vec<u8>) {
        let id = FileId::new(None, VirtualPath::new(path));
        self.files.insert(id, Bytes::new(data));
    }

    /// Get the main file ID.
    pub fn main_id(&self) -> FileId {
        self.main_id
    }
}

impl World for BallotWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }

    fn main(&self) -> FileId {
        self.main_id
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.main_id {
            Ok(self.main_source.clone())
        } else {
            // For imported files, create source from file data
            if let Some(bytes) = self.files.get(&id) {
                let text = std::str::from_utf8(bytes.as_slice())
                    .map_err(|_| FileError::InvalidUtf8)?;
                Ok(Source::new(id, text.to_string()))
            } else {
                Err(FileError::NotFound(id.vpath().as_rootless_path().into()))
            }
        }
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        if let Some(bytes) = self.files.get(&id) {
            Ok(bytes.clone())
        } else {
            Err(FileError::NotFound(id.vpath().as_rootless_path().into()))
        }
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }

    fn today(&self, _offset: Option<i64>) -> Option<Datetime> {
        // Return a fixed date for deterministic output
        Datetime::from_ymd(2024, 1, 1)
    }
}
