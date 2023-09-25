use std::time::Duration;

use crate::pdiscan::EjectDirection;

#[derive(Clone, Copy, Default)]
pub(crate) enum AutoScanConfig {
    #[default]
    Disabled,
    Enabled(EjectDirection),
}

#[derive(Clone, Copy, Default)]
pub(crate) enum WatchStatusConfig {
    #[default]
    Disabled,
    Enabled,
}

pub(crate) const EJECT_DELAY_STEP: Duration = Duration::from_millis(50);
