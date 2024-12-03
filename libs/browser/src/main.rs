use clap::Parser;
use device::{Device, Selection};
use gtk::prelude::*;
use webkit2gtk::{SettingsExt, WebContext, WebView, WebViewExt};

mod device;
mod ipc;
mod keybindings;
mod options;
mod ui;

fn main() -> anyhow::Result<()> {
    let options = options::Options::parse();

    gtk::init()?;

    let Some(context) = WebContext::default() else {
        anyhow::bail!("Failed to create web context");
    };

    let webview = WebView::with_context(&context);
    webview.load_uri(options.url());

    let window = gtk::Window::new(gtk::WindowType::Toplevel);
    window.add(&webview);

    // set up `kiosk.*` APIs
    ipc::setup(&window, &webview)?;

    let device = Device::new(&window, &webview, options.device_configuration());

    if options.is_fullscreen() {
        device.fullscreen();
    }

    let Some(settings) = WebViewExt::settings(&webview) else {
        anyhow::bail!("Failed to get webview settings");
    };
    settings.set_enable_developer_extras(options.allow_devtools());

    // Set up the header bar
    let config_selection = Selection::default();
    if let Err(e) = config_selection.update_by_value(options.device_configuration()) {
        anyhow::bail!("Failed to update selection by value: {e:?}");
    }
    let header_bar = ui::header(&device, config_selection);
    window.set_titlebar(Some(&header_bar));

    // Handle various keybindings, e.g. Ctrl+R to reload the page
    keybindings::attach(options, &device);

    // Close the window when the close button is clicked
    window.connect_delete_event(|_, _| {
        gtk::main_quit();
        gtk::glib::Propagation::Proceed
    });

    // Show the window and start the GTK main loop
    window.show_all();
    gtk::main();

    Ok(())
}
