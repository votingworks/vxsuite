//! Thin bindings for Linux filesystem syscalls that Node does not expose. All
//! policy — retries, fallbacks, error typing — belongs in the TypeScript
//! wrappers in `src/syscalls.ts`, so that it can be tested under vitest;
//! nothing here should ever do more than marshal one syscall.
//!
//! Errors are thrown as JS errors whose message starts with the errno name
//! (e.g. `ENOENT: No such file or directory`), matching the shape of Node's
//! own filesystem errors so the TypeScript side can parse both the same way.

use napi::{Error, Result};
use napi_derive::napi;
use nix::errno::Errno;
use nix::fcntl::{posix_fadvise, renameat2, PosixFadviseAdvice, RenameFlags};
use nix::unistd::syncfs as nix_syncfs;

fn errno_error(errno: Errno) -> Error {
    Error::from_reason(format!("{errno:?}: {}", errno.desc()))
}

/// Atomically exchanges two paths using `renameat2(2)` with `RENAME_EXCHANGE`.
/// Both paths must exist; at no point during the call does either name not
/// exist.
///
/// # Errors
///
/// Fails with the syscall's errno, e.g. `ENOENT` if either path does not
/// exist, or `EINVAL` on a filesystem without `RENAME_EXCHANGE` support.
#[napi]
#[allow(clippy::needless_pass_by_value)] // napi arguments must be owned
pub fn rename_exchange(old_path: String, new_path: String) -> Result<()> {
    renameat2(
        None,
        old_path.as_str(),
        None,
        new_path.as_str(),
        RenameFlags::RENAME_EXCHANGE,
    )
    .map_err(errno_error)
}

/// Renames a path using `renameat2(2)` with `RENAME_NOREPLACE`: fails with
/// `EEXIST` if `new_path` exists, where a plain `rename(2)` would replace it.
///
/// # Errors
///
/// Fails with the syscall's errno, e.g. `EEXIST` if `new_path` exists.
#[napi]
#[allow(clippy::needless_pass_by_value)] // napi arguments must be owned
pub fn rename_no_replace(old_path: String, new_path: String) -> Result<()> {
    renameat2(
        None,
        old_path.as_str(),
        None,
        new_path.as_str(),
        RenameFlags::RENAME_NOREPLACE,
    )
    .map_err(errno_error)
}

/// Asks the kernel to drop the page cache for an open file, via
/// `posix_fadvise(2)` with `POSIX_FADV_DONTNEED` over the whole file.
///
/// # Errors
///
/// Fails with the syscall's errno, e.g. `EBADF` if `fd` is not an open file
/// descriptor.
#[napi]
pub fn fadvise_dont_need(fd: i32) -> Result<()> {
    posix_fadvise(fd, 0, 0, PosixFadviseAdvice::POSIX_FADV_DONTNEED).map_err(errno_error)
}

/// Flushes the filesystem containing the file referred to by `fd`, via
/// `syncfs(2)`: all of that filesystem's dirty data and metadata is written to
/// the device before this returns.
///
/// # Errors
///
/// Fails with the syscall's errno, e.g. `EBADF` if `fd` is not an open file
/// descriptor, or `EIO` if writing the data back failed.
#[napi]
pub fn syncfs(fd: i32) -> Result<()> {
    nix_syncfs(fd).map_err(errno_error)
}
