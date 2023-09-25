use std::{
    os::unix::prelude::{FileTypeExt, MetadataExt},
    process::Command,
};

pub const DEVICE_PATH: &str = "/dev/PageScan3";

/// Determines whether the kernel extension (module) is installed by running
/// `lsmod` and checking whether `pdi_ps3_drv_scanner` is present in the output.
pub(crate) fn is_installed() -> bool {
    let output = Command::new("lsmod").output().unwrap();
    let output = String::from_utf8(output.stdout).unwrap();
    output.contains("pdi_ps3_drv_scanner")
}

/// Determines whether the kernel extension device is present by checking the
/// read/write permissions on `/dev/PageScan3` for the current user. If the
/// device is present and has read and write permissions, returns `true`.
pub(crate) fn is_device_ready() -> bool {
    let stat = match std::fs::metadata(DEVICE_PATH) {
        Ok(stat) => stat,
        Err(_) => return false,
    };

    stat.file_type().is_char_device() && has_read_write_access(&stat)
}

/// Determines whether the current user has read and write access to a file with the given [std::fs::Metadata].
pub(crate) fn has_read_write_access(stat: &std::fs::Metadata) -> bool {
    let mode = stat.mode();

    (stat.uid() == users::get_current_uid() && mode & 0o600 == 0o600)
        || stat.gid() == users::get_current_gid() && mode & 0o060 == 0o060
        || mode & 0o006 == 0o006
}
