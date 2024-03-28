// File originally copied from https://github.com/a1ien/rusb/commit/4d955e48394e2a5c116fd4e3c9408c88536ed894,
// with the license:
//
//     Copyright (c) 2015 David Cuddeback
//                   2019 Ilya Averyanov
//
//     Permission is hereby granted, free of charge, to any person obtaining
//     a copy of this software and associated documentation files (the
//     "Software"), to deal in the Software without restriction, including
//     without limitation the rights to use, copy, modify, merge, publish,
//     distribute, sublicense, and/or sell copies of the Software, and to
//     permit persons to whom the Software is furnished to do so, subject to
//     the following conditions:
//
//     The above copyright notice and this permission notice shall be
//     included in all copies or substantial portions of the Software.
//
//     THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
//     EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
//     MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
//     NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
//     LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
//     OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
//     WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
// Modifications have been made to better support the use case of this project.

use std::result;

/// A result of a function that may return a [`Error`].
pub type Result<T> = result::Result<T, Error>;

/// Possible errors that may occur when using the asynchronous libusb API.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("No transfers pending")]
    NoTransfersPending,

    #[error("Poll timed out")]
    PollTimeout,

    #[error("Transfer is stalled")]
    Stall,

    #[error("Device was disconnected")]
    Disconnected,

    #[error("Device sent more data than expected")]
    Overflow,

    #[error("Other error: {0}")]
    Other(&'static str),

    #[error("{0} Error: {1}")]
    Errno(&'static str, i32),

    #[error("Transfer was cancelled")]
    Cancelled,
}
