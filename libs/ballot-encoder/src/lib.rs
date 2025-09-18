use neon::{prelude::ModuleContext, result::NeonResult};

mod bit_reader;
mod bit_writer;

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("BitWriter_new", bit_writer::bit_writer_new)?;
    cx.export_function("BitWriter_toBytes", bit_writer::bit_writer_to_bytes)?;
    cx.export_function("BitWriter_writeUint1", bit_writer::bit_writer_write_uint1)?;
    cx.export_function(
        "BitWriter_writeBoolean",
        bit_writer::bit_writer_write_boolean,
    )?;
    cx.export_function("BitWriter_writeUint8", bit_writer::bit_writer_write_uint8)?;
    cx.export_function(
        "BitWriter_writeUintWithMax",
        bit_writer::bit_writer_write_uint_with_max,
    )?;
    cx.export_function(
        "BitWriter_writeUintWithSize",
        bit_writer::bit_writer_write_uint_with_size,
    )?;
    cx.export_function(
        "BitWriter_writeStringWithUtf8Encoding",
        bit_writer::bit_writer_write_string_with_utf8_encoding,
    )?;
    cx.export_function(
        "BitWriter_writeStringWithWriteInEncoding",
        bit_writer::bit_writer_write_string_with_write_in_encoding,
    )?;
    cx.export_function(
        "BitWriter_writeStringWithHexEncoding",
        bit_writer::bit_writer_write_string_with_hex_encoding,
    )?;
    Ok(())
}
