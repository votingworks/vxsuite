use std::time::Duration;

use pdi_rs::protocol::types::EjectMotion;

#[derive(Clone, Copy, Default)]
pub enum AutoScanConfig {
    #[default]
    Disabled,
    Enabled(Option<EjectMotion>),
}

#[derive(Clone, Copy, Default)]
pub enum WatchStatusConfig {
    #[default]
    Disabled,
    Enabled,
}

pub const EJECT_DELAY_STEP: Duration = Duration::from_millis(50);
