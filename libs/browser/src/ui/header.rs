//! Manage the header bar of the window which contains all the controls that are
//! not part of the web view.

use gtk::{
    gdk,
    prelude::{
        ButtonExt, ContainerExt, GtkMenuExt, GtkMenuItemExt, LabelExt, MenuShellExt, WidgetExt,
    },
    HeaderBar,
};

use crate::device::{Device, Selection};

/// Builds the UI for the window header bar.
pub fn build(device: &Device, config_selection: Selection) -> HeaderBar {
    let header_bar = gtk::HeaderBar::builder()
        .custom_title(&gtk::Label::new(Some("VxBrowser")))
        .show_close_button(true)
        .build();

    let device_button_label = gtk::Label::new(Some("Device"));

    let set_selected_device_at_index = {
        let config_selection = config_selection.clone();
        let device_button_label = device_button_label.clone();
        let device = device.clone();
        move |index| {
            if let Err(e) = config_selection.update_by_index(index) {
                eprintln!("Failed to update config selection: {e}");
                return;
            }

            let config = config_selection.current();
            device_button_label.set_text(config.name);
            if let Err(e) = device.set_configuration(config) {
                eprintln!("Failed to set device configuration: {e}");
            }
        }
    };

    set_selected_device_at_index(config_selection.current_index());

    let popup_menu = gtk::Menu::new();

    for (index, device) in config_selection.values().iter().enumerate() {
        let menu_item = gtk::RadioMenuItem::builder()
            .label(device.name)
            .active(*device == config_selection.current())
            .build();
        menu_item.connect_activate({
            let set_selected_device_at_index = set_selected_device_at_index.clone();
            move |_| {
                set_selected_device_at_index(index);
            }
        });
        popup_menu.append(&menu_item);
    }

    let device_button = {
        let button = gtk::Button::new();
        let button_box = gtk::Box::new(gtk::Orientation::Horizontal, 6);
        let icon = gtk::Image::from_icon_name(
            Some("org.gnome.Settings-display-symbolic"),
            gtk::IconSize::Menu,
        );
        button_box.add(&icon);
        button_box.add(&device_button_label);
        button.add(&button_box);
        button
    };

    device_button.connect_clicked({
        move |sender| {
            popup_menu.show_all();
            popup_menu.popup_at_widget(
                sender,
                gdk::Gravity::SouthWest,
                gdk::Gravity::NorthWest,
                None,
            );
        }
    });

    header_bar.add(&device_button);

    let fullscreen_button =
        gtk::Button::from_icon_name(Some("view-fullscreen-symbolic"), gtk::IconSize::Button);

    fullscreen_button.connect_clicked({
        let device = device.clone();
        move |_| {
            device.fullscreen();
        }
    });

    header_bar.add(&fullscreen_button);

    header_bar
}
