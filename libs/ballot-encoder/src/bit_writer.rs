use std::{cell::RefCell, io};

use bitstream_io::{BigEndian, BitWrite};
use neon::{prelude::*, types::buffer::TypedArray};

pub struct BitWriter {
    inner: RefCell<Option<bitstream_io::BitWriter<Vec<u8>, BigEndian>>>,
}

impl BitWriter {
    pub fn new() -> Self {
        Self {
            inner: RefCell::new(Some(bitstream_io::BitWriter::new(Vec::new()))),
        }
    }

    fn with_writer(
        &self,
        f: impl FnOnce(&mut bitstream_io::BitWriter<Vec<u8>, BigEndian>) -> Result<(), Error>,
    ) -> Result<(), Error> {
        let mut inner = self
            .inner
            .try_borrow_mut()
            .map_err(|_| Error::AlreadyBorrowed)?;
        match inner.take() {
            Some(mut writer) => {
                let result = f(&mut writer);
                inner.replace(writer);
                Ok(result?)
            }
            None => Err(Error::AlreadyConsumed),
        }
    }

    pub fn write_bit(&self, bit: bool) -> Result<(), Error> {
        self.with_writer(|writer| Ok(writer.write_bit(bit)?))
    }

    pub fn write_bytes(&self, bytes: &[u8]) -> Result<(), Error> {
        self.with_writer(|writer| Ok(writer.write_bytes(bytes)?))
    }

    pub fn write_unsigned_var(&self, bits: u32, value: u64) -> Result<(), Error> {
        self.with_writer(|writer| Ok(writer.write_unsigned_var(bits, value)?))
    }

    pub fn to_vec(&self) -> Option<Vec<u8>> {
        let mut inner = self.inner.take()?;
        inner.byte_align().ok()?;
        Some(inner.into_writer())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("BitWriter has already been consumed")]
    AlreadyConsumed,

    #[error("BitWriter is not multi-threaded")]
    AlreadyBorrowed,

    #[error("I/O error: {0}")]
    Io(#[from] io::Error),
}

impl Finalize for BitWriter {}

type JsBitWriter = JsBox<BitWriter>;

#[allow(clippy::unnecessary_wraps)]
pub fn bit_writer_new(mut cx: FunctionContext) -> JsResult<JsBitWriter> {
    Ok(cx.boxed(BitWriter::new()))
}

pub fn bit_writer_to_bytes(mut cx: FunctionContext) -> JsResult<JsBuffer> {
    let writer = cx.this::<JsBitWriter>()?;
    let Some(bytes) = writer.to_vec() else {
        return cx.throw_error("BitWriter has already been consumed");
    };
    let mut buffer = cx.buffer(bytes.len())?;
    buffer.as_mut_slice(&mut cx).copy_from_slice(&bytes);
    Ok(buffer)
}

pub fn bit_writer_write_uint1(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let writer = cx.this::<JsBitWriter>()?;

    for i in 0..cx.len() {
        let value = match cx.argument::<JsNumber>(i)?.value(&mut cx) {
            0.0 => false,
            1.0 => true,
            invalid_value => {
                return cx.throw_error(format!(
                    "Invalid uint1 value at argument {i}: {invalid_value}"
                ));
            }
        };

        if let Err(err) = writer.write_bit(value) {
            return cx.throw_error(format!("Error: {err}"));
        }
    }

    Ok(cx.undefined())
}

pub fn bit_writer_write_boolean(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let writer = cx.this::<JsBitWriter>()?;

    for i in 0..cx.len() {
        let value = cx.argument::<JsBoolean>(i)?.value(&mut cx);

        if let Err(err) = writer.write_bit(value) {
            return cx.throw_error(format!("Error: {err}"));
        }
    }

    Ok(cx.undefined())
}

pub fn bit_writer_write_uint8(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let writer = cx.this::<JsBitWriter>()?;
    let mut bytes = Vec::with_capacity(cx.len());

    for i in 0..cx.len() {
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let value = match cx.argument::<JsNumber>(i)?.value(&mut cx) {
            value if value <= f64::from(u8::MAX) && value >= f64::from(u8::MIN) => {
                value.round() as u8
            }
            invalid_value => {
                return cx.throw_error(format!(
                    "Invalid uint8 value at argument {i}: {invalid_value}"
                ));
            }
        };

        bytes.push(value);
    }

    match writer.write_bytes(&bytes) {
        Ok(()) => Ok(cx.undefined()),
        Err(err) => cx.throw_error(format!("Error: {err}")),
    }
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
pub fn bit_writer_write_uint_with_max(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let writer = cx.this::<JsBitWriter>()?;
    let (value, max): (f64, f64) = cx.args()?;

    if value > max {
        return cx.throw_error(format!("overflow: {value} must be less than {max}"));
    }

    let value = value.round() as u64;
    let max = max.round() as u64;

    let bits = u64::BITS - u64::leading_zeros(max);

    match writer.write_unsigned_var(bits, value) {
        Ok(()) => Ok(cx.undefined()),
        Err(err) => cx.throw_error(format!("Error: {err}")),
    }
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
pub fn bit_writer_write_uint_with_size(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let writer = cx.this::<JsBitWriter>()?;
    let (value, size): (f64, f64) = cx.args()?;

    let value = value.round() as u64;
    let size = size.round() as u32;

    let min_bits = u64::BITS - u64::leading_zeros(value);

    if size < min_bits {
        return cx.throw_error(format!("overflow: {value} cannot fit in {size} bits"));
    }

    match writer.write_unsigned_var(size, value) {
        Ok(()) => Ok(cx.undefined()),
        Err(err) => cx.throw_error(err.to_string()),
    }
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
pub fn bit_writer_write_string_with_utf8_encoding(
    mut cx: FunctionContext,
) -> JsResult<JsUndefined> {
    let writer = cx.this::<JsBitWriter>()?;
    let (value, write_length, max_length): (String, bool, f64) = cx.args()?;
    let bytes = value.as_bytes();

    if write_length {
        let max_length = max_length.round() as u64;

        if (max_length as usize) < bytes.len() {
            return cx.throw_error(format!(
                "overflow: cannot write a string longer than max length: {} > {max_length}",
                bytes.len()
            ));
        }

        let length_bits = u64::BITS - u64::leading_zeros(max_length);
        if let Err(err) = writer.write_unsigned_var(length_bits, value.len() as u64) {
            return cx.throw_error(err.to_string());
        }
    }

    match writer.write_bytes(value.as_bytes()) {
        Ok(()) => Ok(cx.undefined()),
        Err(err) => cx.throw_error(err.to_string()),
    }
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
pub fn bit_writer_write_string_with_hex_encoding(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let writer = cx.this::<JsBitWriter>()?;
    let (value, write_length, max_length): (String, bool, f64) = cx.args()?;

    let bytes = match hex::decode(&value) {
        Ok(bytes) => bytes,
        Err(err) => return cx.throw_error(format!("invalid hex string '{value}': {err}")),
    };

    if write_length {
        let max_length = max_length.round() as u64;

        if (max_length as usize) < bytes.len() {
            return cx.throw_error(format!(
                "overflow: cannot write a string longer than max length: {} > {max_length}",
                bytes.len()
            ));
        }

        let length_bits = u64::BITS - u64::leading_zeros(max_length);
        if let Err(err) = writer.write_unsigned_var(length_bits, value.len() as u64) {
            return cx.throw_error(err.to_string());
        }
    }

    match writer.write_bytes(&bytes) {
        Ok(()) => Ok(cx.undefined()),
        Err(err) => cx.throw_error(err.to_string()),
    }
}

const WRITE_IN_ENCODING: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ '\"-.,";

pub fn bit_writer_write_string_with_write_in_encoding(
    mut cx: FunctionContext,
) -> JsResult<JsUndefined> {
    let writer = cx.this::<JsBitWriter>()?;
    let (value, write_length, max_length): (String, bool, f64) = cx.args()?;

    todo!()
}
