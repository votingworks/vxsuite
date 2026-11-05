//! Thin bindings for Linux filesystem syscalls that Node does not expose. All
//! policy — retries, fallbacks, error typing — belongs in the TypeScript
//! wrappers in `src/syscalls.ts`, so that it can be tested under vitest;
//! nothing here should do more than open a path and marshal one syscall.
//! Bindings take paths rather than descriptors so that every descriptor a
//! syscall sees is one Rust opened and owns.
//!
//! Errors are thrown as JS errors whose message starts with the errno name
//! (e.g. `ENOENT: No such file or directory`), matching the shape of Node's
//! own filesystem errors so the TypeScript side can parse both the same way.

use std::fs::{File, OpenOptions};
use std::io;

use napi::{Env, Error, Result, Task, bindgen_prelude::AsyncTask};
use napi_derive::napi;
use nix::errno::Errno;
use nix::fcntl::{
    AT_FDCWD, Flock, FlockArg, PosixFadviseAdvice, RenameFlags, posix_fadvise, renameat2,
};
use nix::unistd::syncfs as nix_syncfs;

fn errno_error(errno: Errno) -> Error {
    Error::from_reason(format!("{errno:?}: {}", errno.desc()))
}

fn open_error(path: &str, error: &io::Error) -> Error {
    let reason = match error.raw_os_error() {
        Some(code) => errno_error(Errno::from_raw(code)).reason,
        None => format!("EINVAL: {error}"),
    };
    Error::from_reason(format!("{reason}, open '{path}'"))
}

fn open_read_only(path: &str) -> Result<File> {
    File::open(path).map_err(|error| open_error(path, &error))
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
        AT_FDCWD,
        old_path.as_str(),
        AT_FDCWD,
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
        AT_FDCWD,
        old_path.as_str(),
        AT_FDCWD,
        new_path.as_str(),
        RenameFlags::RENAME_NOREPLACE,
    )
    .map_err(errno_error)
}

/// Asks the kernel to drop the page cache for a file, via `posix_fadvise(2)`
/// with `POSIX_FADV_DONTNEED` over the whole file.
///
/// # Errors
///
/// Fails with the errno from opening `path` (e.g. `ENOENT`) or from the
/// syscall.
#[napi]
#[allow(clippy::needless_pass_by_value)] // napi arguments must be owned
pub fn fadvise_dont_need(path: String) -> Result<()> {
    let file = open_read_only(&path)?;
    posix_fadvise(&file, 0, 0, PosixFadviseAdvice::POSIX_FADV_DONTNEED).map_err(errno_error)
}

pub struct SyncfsTask {
    path: String,
}

impl Task for SyncfsTask {
    type Output = ();
    type JsValue = ();

    fn compute(&mut self) -> Result<()> {
        let file = open_read_only(&self.path)?;
        nix_syncfs(&file).map_err(errno_error)
    }

    fn resolve(&mut self, _env: Env, _output: ()) -> Result<()> {
        Ok(())
    }
}

/// Flushes the filesystem containing `path`, which may be a file or a
/// directory, via `syncfs(2)` on a worker thread: the returned Promise resolves
/// once all of that filesystem's dirty data and metadata is on the device.
///
/// # Errors
///
/// Rejects with the errno from opening `path` (e.g. `ENOENT`) or from the
/// syscall, e.g. `EIO` if writing the data back failed.
#[napi(ts_return_type = "Promise<void>")]
#[must_use]
pub fn syncfs(path: String) -> AsyncTask<SyncfsTask> {
    AsyncTask::new(SyncfsTask { path })
}

/// An exclusive `flock(2)` lock on an open file. Releasing it, or the object
/// being garbage-collected, unlocks and closes the file.
#[napi]
pub struct ExclusiveLock {
    lock: Option<Flock<File>>,
}

#[napi]
impl ExclusiveLock {
    /// Unlocks and closes the file; releasing again does nothing.
    #[napi]
    pub fn release(&mut self) {
        self.lock = None;
    }
}

/// Opens `path` for appending, creating it if needed, and takes an exclusive
/// advisory lock on it without waiting, via `flock(2)` with
/// `LOCK_EX | LOCK_NB`. The kernel drops the lock when the file closes,
/// including when the process holding it dies, so a lock can never be left
/// stranded by a crash.
///
/// # Errors
///
/// Fails with the errno from opening `path` (e.g. `ENOENT`), or with
/// `EWOULDBLOCK` (reported as `EAGAIN`) when another open file description
/// already holds the lock.
#[napi]
#[allow(clippy::needless_pass_by_value)] // napi arguments must be owned
pub fn lock_file_exclusive_nonblocking(path: String) -> Result<ExclusiveLock> {
    let file = OpenOptions::new()
        .append(true)
        .create(true)
        .open(&path)
        .map_err(|error| open_error(&path, &error))?;
    let lock = Flock::lock(file, FlockArg::LockExclusiveNonblock)
        .map_err(|(_, errno)| errno_error(errno))?;
    Ok(ExclusiveLock { lock: Some(lock) })
}
