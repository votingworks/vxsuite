use std::{cell::RefCell, io};

use bitstream_io::{BigEndian, BitRead};
use neon::prelude::*;

pub struct BitReader {
    inner: RefCell<Option<bitstream_io::BitReader<io::Cursor<Vec<u8>>, BigEndian>>>,
}

impl BitReader {
    pub fn new(data: Vec<u8>) -> Self {
        Self {
            inner: RefCell::new(Some(bitstream_io::BitReader::new(io::Cursor::new(data)))),
        }
    }

    fn with_reader<T>(
        &self,
        f: impl FnOnce(&mut bitstream_io::BitReader<io::Cursor<Vec<u8>>, BigEndian>) -> Result<T, Error>,
    ) -> Result<T, Error> {
        let mut inner = self
            .inner
            .try_borrow_mut()
            .map_err(|_| Error::AlreadyBorrowed)?;
        match inner.take() {
            Some(mut reader) => {
                let result = f(&mut reader);
                inner.replace(reader);
                Ok(result?)
            }
            None => Err(Error::AlreadyConsumed),
        }
    }

    pub fn read_bit(&self) -> Result<bool, Error> {
        self.with_reader(|reader| Ok(reader.read_bit()?))
    }
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("BitReader has already been consumed")]
    AlreadyConsumed,

    #[error("BitReader is not multi-threaded")]
    AlreadyBorrowed,

    #[error("I/O error: {0}")]
    Io(#[from] io::Error),
}

impl Finalize for BitReader {}

type JsBitReader = JsBox<BitReader>;

#[allow(clippy::unnecessary_wraps)]
pub fn bit_reader_new(mut cx: FunctionContext) -> JsResult<JsBitReader> {
    let data: Vec<u8> = cx.arg()?;
    Ok(cx.boxed(BitReader::new(data)))
}

pub fn bit_reader_read_boolean(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let reader = cx.this::<JsBitReader>()?;
    let bit = match reader.read_bit() {
        Ok(bit) => bit,
        Err(err) => return cx.throw_error(err.to_string()),
    };

    Ok(cx.boolean(bit))
}
