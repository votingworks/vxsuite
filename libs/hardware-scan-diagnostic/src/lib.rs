#![deny(clippy::all)]

mod debug;
mod js;
mod line_fitting;
mod shape;

#[macro_use]
extern crate napi_derive;

pub use js::*;
