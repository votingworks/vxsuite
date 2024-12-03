use gtk::prelude::{DialogExt, FileChooserExt};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChooserOptions {
    pub title: String,
    #[serde(default)]
    pub filters: Vec<FileFilter>,
    #[serde(default)]
    pub select_multiple: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

/// Create a file chooser dialog with the given options.
pub fn file_chooser(window: &gtk::Window, options: &FileChooserOptions) -> gtk::FileChooserDialog {
    let dialog = gtk::FileChooserDialog::new(
        Some(&options.title),
        Some(window),
        gtk::FileChooserAction::Open,
    );

    for FileFilter { name, extensions } in &options.filters {
        let filter = gtk::FileFilter::new();
        filter.set_name(Some(name));
        for extension in extensions {
            filter.add_pattern(&format!("*.{extension}"));
        }
        dialog.add_filter(filter);
    }

    dialog.add_button("Cancel", gtk::ResponseType::Cancel);
    dialog.add_button("Open", gtk::ResponseType::Accept);
    dialog.set_select_multiple(options.select_multiple);

    dialog
}
