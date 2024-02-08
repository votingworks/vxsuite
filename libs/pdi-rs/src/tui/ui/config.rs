use std::time::Duration;

use pdi_rs::pdiscan::protocol::types::EjectMotion;

#[derive(Clone, Copy, Default)]
pub(crate) enum AutoScanConfig {
    #[default]
    Disabled,
    Enabled(Option<EjectMotion>),
}

#[derive(Clone, Copy, Default)]
pub(crate) enum WatchStatusConfig {
    #[default]
    Disabled,
    Enabled,
}

pub(crate) const EJECT_DELAY_STEP: Duration = Duration::from_millis(50);
