#![deny(clippy::all)]

use std::io::{self, BufRead, BufReader, BufWriter, Read, Write};

use flate2::{read::GzDecoder, write::GzEncoder, Compression};

/// Reads data as either an uncompressed or gzip-compressed stream.
pub enum Reader<R: Read> {
    Gzip(BufReader<GzDecoder<R>>),
    Plain(BufReader<R>),
}

impl<R: Read> Reader<R> {
    pub fn new(inner: R, compressed: bool) -> Reader<R> {
        if !compressed {
            return Reader::Plain(BufReader::new(inner));
        }

        Reader::Gzip(BufReader::new(GzDecoder::new(inner)))
    }
}

impl<R: Read> Read for Reader<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        match self {
            Reader::Gzip(r) => r.read(buf),
            Reader::Plain(r) => r.read(buf),
        }
    }
}

impl<R: Read> BufRead for Reader<R> {
    fn consume(&mut self, amt: usize) {
        match self {
            Reader::Gzip(r) => r.consume(amt),
            Reader::Plain(r) => r.consume(amt),
        }
    }

    fn fill_buf(&mut self) -> io::Result<&[u8]> {
        match self {
            Reader::Gzip(r) => r.fill_buf(),
            Reader::Plain(r) => r.fill_buf(),
        }
    }
}

/// Writes data as either an uncompressed or gzip-compressed stream.
pub enum Writer<W: Write> {
    Gzip(BufWriter<GzEncoder<W>>),
    Plain(BufWriter<W>),
}

impl<W: Write> Writer<W> {
    pub fn new(inner: W, compressed: bool) -> Writer<W> {
        if !compressed {
            return Writer::Plain(BufWriter::new(inner));
        }

        Writer::Gzip(BufWriter::new(GzEncoder::new(
            inner,
            Compression::default(),
        )))
    }
}

impl<W: Write> Write for Writer<W> {
    fn flush(&mut self) -> io::Result<()> {
        match self {
            Writer::Gzip(w) => w.flush(),
            Writer::Plain(w) => w.flush(),
        }
    }

    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        match self {
            Writer::Gzip(w) => w.write(buf),
            Writer::Plain(w) => w.write(buf),
        }
    }
}
