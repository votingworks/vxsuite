use std::{
    str::FromStr,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, RwLock,
    },
};

use gtk::prelude::*;
use webkit2gtk::{WebInspectorExt, WebView, WebViewExt};

/// Configuration of a VX device.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Configuration {
    pub name: &'static str,
    pub dimensions: (i32, i32),
}

/// Handles parsing known device names from the CLI.
impl FromStr for Configuration {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "vxscan" | "scan" | "s" => Ok(VXSCAN_CONFIG),
            "vxadmin" | "admin" | "a" => Ok(VXADMIN_CONFIG),
            "vxcentralscan" | "centralscan" | "central-scan" | "central" | "c" => {
                Ok(VXCENTRALSCAN_CONFIG)
            }
            "vxmark" | "mark-scan" | "mark" | "m" => Ok(VXMARK_CONFIG),
            _ => Err(format!("Unknown device: {s}")),
        }
    }
}

pub const VXSCAN_CONFIG: Configuration = Configuration {
    name: "VxScan",
    dimensions: (1920, 1080),
};

pub const VXADMIN_CONFIG: Configuration = Configuration {
    name: "VxAdmin",
    dimensions: (1920, 1200),
};

pub const VXCENTRALSCAN_CONFIG: Configuration = Configuration {
    name: "VxCentralScan",
    dimensions: (1920, 1200),
};

pub const VXMARK_CONFIG: Configuration = Configuration {
    name: "VxMark",
    dimensions: (1080, 1920),
};

#[derive(Debug, Clone)]
pub struct Selection {
    values: Vec<Configuration>,
    index: Arc<AtomicUsize>,
}

impl Selection {
    pub fn new(selected_index: usize, values: impl IntoIterator<Item = Configuration>) -> Self {
        let index = Arc::new(AtomicUsize::new(selected_index));
        Self {
            values: values.into_iter().collect(),
            index,
        }
    }

    pub fn current(&self) -> Configuration {
        self.values[self.index.load(Ordering::Relaxed)]
    }

    pub fn current_index(&self) -> usize {
        self.index.load(Ordering::Relaxed)
    }

    pub fn update_by_index(&self, index: usize) -> anyhow::Result<()> {
        if index >= self.values.len() {
            anyhow::bail!("Index out of bounds: {index}");
        }
        self.index.store(index, Ordering::Relaxed);
        Ok(())
    }

    pub fn values(&self) -> &[Configuration] {
        &self.values
    }

    pub fn update_by_value(&self, value: Configuration) -> anyhow::Result<()> {
        let Some(index) = self.values.iter().position(|v| v == &value) else {
            anyhow::bail!("Value not in list: {value:?}")
        };

        self.update_by_index(index)
    }
}

impl Default for Selection {
    fn default() -> Self {
        Self::new(
            0,
            vec![
                VXSCAN_CONFIG,
                VXADMIN_CONFIG,
                VXCENTRALSCAN_CONFIG,
                VXMARK_CONFIG,
            ],
        )
    }
}

/// Wrapper around a GTK window and a webview to ease various operations and
/// state management.
#[derive(Debug, Clone)]
pub struct Device {
    pub window: gtk::Window,
    pub webview: WebView,
    pub configuration: Arc<RwLock<Configuration>>,
    pub is_inspector_open: Arc<AtomicBool>,
}

impl Device {
    pub fn new(window: &gtk::Window, webview: &WebView, configuration: Configuration) -> Self {
        let is_inspector_open = attach_inspector_handlers(&webview);

        Self {
            window: window.clone(),
            webview: webview.clone(),
            configuration: Arc::new(RwLock::new(configuration)),
            is_inspector_open,
        }
    }

    /// Returns the current configuration.
    pub fn configuration(&self) -> anyhow::Result<Configuration> {
        match self.configuration.try_read() {
            Ok(reader) => Ok(*reader),
            Err(e) => anyhow::bail!("Failed to read configuration: {e:?}"),
        }
    }

    /// Resizes the window according to the current configuration.
    pub fn reset_size(&self) -> anyhow::Result<()> {
        let (width, height) = self.configuration()?.dimensions;
        // reset minimum size
        self.window.resize(1, 1);
        // set the size we want for the webview; this will resize the window
        self.webview.set_size_request(width, height);
        Ok(())
    }

    /// Makes the window fullscreen.
    pub fn fullscreen(&self) {
        self.window.resize(1, 1);
        self.window.fullscreen();
        let monitor = self
            .window
            .display()
            .monitor(0)
            .expect("window has a monitor");
        let geometry = monitor.geometry();
        self.webview
            .set_size_request(geometry.width(), geometry.height());
    }

    /// Returns to windowed mode.
    pub fn unfullscreen(&self) -> anyhow::Result<()> {
        self.window.unfullscreen();
        self.reset_size()?;
        Ok(())
    }

    /// Reloads the webview at its current URL.
    pub fn reload(&self) {
        self.webview.reload();
    }

    /// Sets the configuration of the device.
    pub fn set_configuration(&self, configuration: Configuration) -> anyhow::Result<()> {
        match self.configuration.write() {
            Ok(mut writer) => *writer = configuration,
            Err(e) => anyhow::bail!("Failed to write configuration: {e:?}"),
        }
        self.reset_size()?;
        Ok(())
    }

    pub fn toggle_devtools(&self) {
        let is_devtools_open = &self.is_inspector_open;

        if let Some(inspector) = self.webview.inspector() {
            inspector.detach();

            if is_devtools_open.load(Ordering::Relaxed) {
                is_devtools_open.store(false, Ordering::Relaxed);
                inspector.close();
            } else {
                is_devtools_open.store(true, Ordering::Relaxed);
                inspector.show();
            }
        }
    }
}

/// Returns an atomic boolean that tracks whether the inspector is open or not.
fn attach_inspector_handlers(webview: &WebView) -> Arc<AtomicBool> {
    let is_inspector_open = Arc::new(AtomicBool::default());
    if let Some(inspector) = webview.inspector() {
        let is_inspector_open_ = is_inspector_open.clone();
        inspector.connect_bring_to_front(move |_| {
            is_inspector_open_.store(true, Ordering::Relaxed);
            false
        });
        let is_inspector_open_ = is_inspector_open.clone();
        inspector.connect_closed(move |_| {
            is_inspector_open_.store(false, Ordering::Relaxed);
        });
    }
    is_inspector_open
}
