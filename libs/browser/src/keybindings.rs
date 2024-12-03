use gtk::gdk;
use gtk::prelude::*;

use crate::device::Device;
use crate::options::Options;

/// Set up handler for key press events, e.g. Ctrl+R to reload the page.
pub fn attach(options: Options, device: &Device) {
    device.window.connect_key_press_event({
        let device = device.clone();

        move |_, event| {
            let modifiers = event.state();
            match event.keyval() {
                gdk::keys::constants::w if modifiers.contains(gdk::ModifierType::CONTROL_MASK) => {
                    gtk::main_quit();
                    gtk::glib::Propagation::Stop
                }
                gdk::keys::constants::r if modifiers.contains(gdk::ModifierType::CONTROL_MASK) => {
                    device.reload();
                    gtk::glib::Propagation::Stop
                }
                gdk::keys::constants::Escape => {
                    if options.is_dev() {
                        device.unfullscreen().expect("unfullscreen should work");
                    }
                    gtk::glib::Propagation::Stop
                }
                gdk::keys::constants::I
                    if modifiers.contains(
                        gdk::ModifierType::CONTROL_MASK | gdk::ModifierType::SHIFT_MASK,
                    ) =>
                {
                    if options.allow_devtools() {
                        device.toggle_devtools();
                    }
                    gtk::glib::Propagation::Stop
                }
                _ => gtk::glib::Propagation::Proceed,
            }
        }
    });
}
