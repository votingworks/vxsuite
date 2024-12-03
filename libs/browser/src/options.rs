use clap::Parser;

use crate::device::Configuration;

#[derive(Parser, Clone)]
pub struct Options {
    /// The URL to open in the browser
    #[clap(default_value = "http://localhost:3000/", env = "KIOSK_BROWSER_URL")]
    url: String,

    /// Allow or disallow devtools
    #[clap(short, long, env = "KIOSK_BROWSER_ALLOW_DEVTOOLS")]
    allow_devtools: Option<bool>,

    /// The device whose configuration to use (e.g. vxscan, vxadmin, vxcentralscan, vxmark)
    #[clap(short, long, default_value = "vxscan", env = "VX_MACHINE_TYPE")]
    device: Configuration,

    /// Open the browser in fullscreen mode
    #[clap(short, long, env = "KIOSK_BROWSER_FULLSCREEN")]
    fullscreen: Option<bool>,

    /// Open in development mode
    #[clap(long, default_value = "false")]
    dev: bool,
}

impl Options {
    pub fn url(&self) -> &str {
        self.url.as_str()
    }

    pub const fn allow_devtools(&self) -> bool {
        match self.allow_devtools {
            Some(allow) => allow,
            None => self.dev,
        }
    }

    pub const fn is_fullscreen(&self) -> bool {
        match self.fullscreen {
            Some(fullscreen) => fullscreen,
            None => !self.dev,
        }
    }

    pub const fn device_configuration(&self) -> Configuration {
        self.device
    }

    pub const fn is_dev(&self) -> bool {
        self.dev
    }
}
