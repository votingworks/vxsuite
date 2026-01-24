use std::io::Error;
use tokio::io::AsyncWriteExt;
use tokio::time::{sleep, Duration};
use tokio_serial::SerialStream;

/// `FuzzyScan` Serial Command packet delimiter (prefix and suffix)
const FSC_PACKET_DELIMITER: u8 = 0x7E;

/// Escape prefix for special characters in FSC protocol
const FSC_ESCAPE_PREFIX: u8 = 0x5C;

const COMMAND_DELAY: Duration = Duration::from_millis(100);

trait FscEscape {
    fn escape_push(&mut self, byte: u8);
}

/// Escape a byte if needed and push to buffer. Generally, in the command parameters
/// we need to escape reserved byte sequences defined in FSC Manual p.12 "Escape Sequence".
impl FscEscape for Vec<u8> {
    fn escape_push(&mut self, byte: u8) {
        match byte {
            FSC_PACKET_DELIMITER => self.extend_from_slice(&[FSC_ESCAPE_PREFIX, 0x00]),
            FSC_ESCAPE_PREFIX => self.extend_from_slice(&[FSC_ESCAPE_PREFIX, 0x01]),
            0x06 => self.extend_from_slice(&[FSC_ESCAPE_PREFIX, 0x02]),
            0x15 => self.extend_from_slice(&[FSC_ESCAPE_PREFIX, 0x03]),
            0x11 => self.extend_from_slice(&[FSC_ESCAPE_PREFIX, 0x04]),
            0x13 => self.extend_from_slice(&[FSC_ESCAPE_PREFIX, 0x05]),
            _ => self.push(byte),
        }
    }
}

/// Build a `FuzzyScan` Serial Command packet
fn build_command(opcode: [u8; 3], status: u8, parameters: &[u8]) -> Vec<u8> {
    let length = u16::try_from(parameters.len())
        .expect("Parameter length should be within bounds of max u16");
    let length_bytes = [(length >> 8) as u8, (length & 0xFF) as u8];

    // Calculate LRC: XOR of opcode, status, length, and parameters
    let mut lrc: u8 = 0;
    for &b in &opcode {
        lrc ^= b;
    }
    lrc ^= status;
    for &b in &length_bytes {
        lrc ^= b;
    }
    for &b in parameters {
        lrc ^= b;
    }

    // Prefix
    let mut packet = vec![FSC_PACKET_DELIMITER];
    // These bytes not escaped; we expect them to use the reserved byte sequences
    packet.extend_from_slice(&opcode);
    packet.push(status);

    // Params etc. are escaped
    for &b in &length_bytes {
        packet.escape_push(b);
    }
    for &b in parameters {
        packet.escape_push(b);
    }
    packet.escape_push(lrc);

    packet.push(FSC_PACKET_DELIMITER); // Suffix
    packet
}

/// Send a command to the scanner and wait for it to process
async fn send_command(port: &mut SerialStream, command: &[u8]) -> Result<(), Error> {
    port.write_all(command).await?;
    port.flush().await?;
    sleep(COMMAND_DELAY).await;
    Ok(())
}

/// Commands that can be sent to the scanner
pub mod commands {
    use super::build_command;

    /// Build a Buzzer Volume command to set volume to low
    pub fn set_buzzer_volume_low() -> Vec<u8> {
        let opcode = [0x80, 0x01, 0x03];
        let parameters: &[u8] = &[0x00]; // Low volume
        build_command(opcode, 0x00, parameters)
    }

    /// Build a command to enable PDF417 and disable all other common symbologies
    pub fn set_symbology_pdf417_only() -> Vec<u8> {
        let opcode = [0x85, 0x00, 0x00];
        let parameters: &[u8] = &[
            // PDF417/MicroPDF417 - enable both
            0x22, 0x00, // PID
            0x00, 0x02, // Size: 2 bytes
            0x01, 0x01, // Option: enable PDF417, enable MicroPDF417
            // End PDF417/MicroPDF417 command sequence
            //
            // 1D barcodes
            //
            0x00, 0x00, 0x00, 0x01, 0x00, // Code 39 - disable
            0x01, 0x00, 0x00, 0x01, 0x00, // Codabar - disable
            0x02, 0x00, 0x00, 0x02, 0x00, 0x00, // UPC-A/UPC-E - disable both
            0x03, 0x00, 0x00, 0x02, 0x00, 0x00, // EAN-13/EAN-8 - disable both
            0x04, 0x02, 0x00, 0x01, 0x00, // Interleaved 2 of 5 - disable
            0x06, 0x00, 0x00, 0x01, 0x00, // Code 93 - disable
            0x08, 0x00, 0x00, 0x01, 0x00, // Code 128 - disable
            0x08, 0x04, 0x00, 0x01, 0x00, // GS1-128 - disable
            // 2D barcodes
            // GS1 DataBar - disable (3-byte option)
            0x20, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00,
            //
            // Disable other 2D barcodes
            //
            0x30, 0x00, 0x00, 0x01, 0x00, // QR Code - disable
            0x30, 0x01, 0x00, 0x01, 0x00, // Micro QR Code - disable
            0x31, 0x00, 0x00, 0x01, 0x00, // Data Matrix - disable
            0x33, 0x00, 0x00, 0x01, 0x00, // Aztec Code - disable
        ];
        build_command(opcode, 0x00, parameters)
    }
}

/// High-level scanner operations
pub struct Scanner<'a> {
    port: &'a mut SerialStream,
}

impl<'a> Scanner<'a> {
    pub fn new(port: &'a mut SerialStream) -> Self {
        Self { port }
    }

    /// Set buzzer volume to low
    pub async fn set_buzzer_volume_low(&mut self) -> Result<(), Error> {
        let command = commands::set_buzzer_volume_low();
        send_command(self.port, &command).await
    }

    /// Set symbology to PDF417 only, disabling all other common symbologies
    pub async fn set_symbology_pdf417_only(&mut self) -> Result<(), Error> {
        let command = commands::set_symbology_pdf417_only();
        send_command(self.port, &command).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_push_does_not_escape_regular_bytes() {
        let mut buf = Vec::new();
        buf.escape_push(0x42);
        assert_eq!(buf, vec![0x42]);
    }

    #[test]
    fn escape_push_escapes_packet_delimiter() {
        let mut buf = Vec::new();
        buf.escape_push(FSC_PACKET_DELIMITER);
        assert_eq!(buf, vec![FSC_ESCAPE_PREFIX, 0x00]);
    }

    #[test]
    fn escape_push_escapes_escape_prefix() {
        let mut buf = Vec::new();
        buf.escape_push(FSC_ESCAPE_PREFIX);
        assert_eq!(buf, vec![FSC_ESCAPE_PREFIX, 0x01]);
    }

    #[test]
    fn escape_push_escapes_ack() {
        let mut buf = Vec::new();
        buf.escape_push(0x06);
        assert_eq!(buf, vec![FSC_ESCAPE_PREFIX, 0x02]);
    }

    #[test]
    fn escape_push_escapes_nak() {
        let mut buf = Vec::new();
        buf.escape_push(0x15);
        assert_eq!(buf, vec![FSC_ESCAPE_PREFIX, 0x03]);
    }

    #[test]
    fn escape_push_escapes_xon() {
        let mut buf = Vec::new();
        buf.escape_push(0x11);
        assert_eq!(buf, vec![FSC_ESCAPE_PREFIX, 0x04]);
    }

    #[test]
    fn escape_push_escapes_xoff() {
        let mut buf = Vec::new();
        buf.escape_push(0x13);
        assert_eq!(buf, vec![FSC_ESCAPE_PREFIX, 0x05]);
    }

    #[test]
    fn escape_push_appends_to_existing_buffer() {
        let mut buf = vec![0x01, 0x02];
        buf.escape_push(0x03);
        assert_eq!(buf, vec![0x01, 0x02, 0x03]);
    }

    #[test]
    fn escape_push_appends_escaped_sequence_to_existing_buffer() {
        let mut buf = vec![0x01, 0x02];
        buf.escape_push(FSC_PACKET_DELIMITER);
        assert_eq!(buf, vec![0x01, 0x02, FSC_ESCAPE_PREFIX, 0x00]);
    }

    #[test]
    fn build_command_starts_with_packet_delimiter() {
        let packet = build_command([0x80, 0x00, 0x00], 0x00, &[]);
        assert_eq!(packet[0], FSC_PACKET_DELIMITER);
    }

    #[test]
    fn build_command_ends_with_packet_delimiter() {
        let packet = build_command([0x80, 0x00, 0x00], 0x00, &[]);
        assert_eq!(packet[packet.len() - 1], FSC_PACKET_DELIMITER);
    }

    #[test]
    fn build_command_includes_opcode_after_prefix() {
        let packet = build_command([0x85, 0x01, 0x03], 0x00, &[]);
        assert_eq!(&packet[1..4], &[0x85, 0x01, 0x03]);
    }

    #[test]
    fn build_command_includes_status_after_opcode() {
        let packet = build_command([0x80, 0x00, 0x00], 0x04, &[]);
        assert_eq!(packet[4], 0x04);
    }

    #[test]
    fn build_command_includes_length_as_big_endian() {
        let packet = build_command([0x80, 0x00, 0x00], 0x00, &[0xAA, 0xBB, 0xCC]);
        assert_eq!(&packet[5..7], &[0x00, 0x03]);
    }

    #[test]
    fn build_command_includes_parameters_after_length() {
        let packet = build_command([0x80, 0x00, 0x00], 0x00, &[0xAA, 0xBB]);
        assert_eq!(&packet[7..9], &[0xAA, 0xBB]);
    }

    #[test]
    fn build_command_calculates_correct_lrc() {
        // Known good from manual: Buzzer Volume Low
        // LRC = 0x80 ^ 0x01 ^ 0x03 ^ 0x00 ^ 0x00 ^ 0x01 ^ 0x00 = 0x83
        let packet = build_command([0x80, 0x01, 0x03], 0x00, &[0x00]);
        let lrc_index = packet.len() - 2;
        assert_eq!(packet[lrc_index], 0x83);
    }

    #[test]
    fn build_command_escapes_special_bytes_in_parameters() {
        let packet = build_command([0x80, 0x00, 0x00], 0x00, &[0x06]);
        assert!(packet.windows(2).any(|w| w == [FSC_ESCAPE_PREFIX, 0x02]));
    }

    #[test]
    fn build_command_escapes_special_bytes_in_lrc() {
        // Craft a command where LRC equals 0x7E (packet delimiter)
        // LRC = 0x7E ^ 0x00 ^ 0x00 ^ 0x00 ^ 0x00 = 0x7E
        let packet = build_command([0x7E, 0x00, 0x00], 0x00, &[]);
        let before_suffix = &packet[..packet.len() - 1];
        assert!(
            before_suffix.ends_with(&[FSC_ESCAPE_PREFIX, 0x00]),
            "LRC 0x7E should be escaped"
        );
    }

    #[test]
    fn build_command_handles_empty_parameters() {
        let packet = build_command([0x80, 0x03, 0x00], 0x00, &[]);
        assert_eq!(&packet[5..7], &[0x00, 0x00]);
    }

    #[test]
    fn set_buzzer_volume_low_matches_manual() {
        let command = commands::set_buzzer_volume_low();
        let expected = vec![0x7E, 0x80, 0x01, 0x03, 0x00, 0x00, 0x01, 0x00, 0x83, 0x7E];
        assert_eq!(command, expected);
    }

    #[test]
    fn set_symbology_pdf417_only_has_correct_framing() {
        let command = commands::set_symbology_pdf417_only();
        assert_eq!(command[0], FSC_PACKET_DELIMITER);
        assert_eq!(command[command.len() - 1], FSC_PACKET_DELIMITER);
    }

    #[test]
    fn set_symbology_pdf417_only_has_correct_opcode() {
        let command = commands::set_symbology_pdf417_only();
        assert_eq!(&command[1..4], &[0x85, 0x00, 0x00]);
    }

    #[test]
    fn set_symbology_pdf417_only_enables_pdf417() {
        let command = commands::set_symbology_pdf417_only();
        let pdf417_enable = [0x22, 0x00, 0x00, 0x02, 0x01, 0x01];
        assert!(
            command
                .windows(pdf417_enable.len())
                .any(|w| w == pdf417_enable),
            "Should contain PDF417 enable sequence"
        );
    }

    #[test]
    fn set_symbology_pdf417_only_disables_code39() {
        let command = commands::set_symbology_pdf417_only();
        let code39_disable = [0x00, 0x00, 0x00, 0x01, 0x00];
        assert!(
            command
                .windows(code39_disable.len())
                .any(|w| w == code39_disable),
            "Should contain Code 39 disable sequence"
        );
    }

    #[test]
    fn set_symbology_pdf417_only_disables_codabar() {
        let command = commands::set_symbology_pdf417_only();
        let codabar_disable = [0x01, 0x00, 0x00, 0x01, 0x00];
        assert!(
            command
                .windows(codabar_disable.len())
                .any(|w| w == codabar_disable),
            "Should contain Codabar disable sequence"
        );
    }

    #[test]
    fn set_symbology_pdf417_only_disables_upc() {
        let command = commands::set_symbology_pdf417_only();
        let upc_disable = [0x02, 0x00, 0x00, 0x02, 0x00, 0x00];
        assert!(
            command.windows(upc_disable.len()).any(|w| w == upc_disable),
            "Should contain UPC disable sequence"
        );
    }

    #[test]
    fn set_symbology_pdf417_only_disables_ean() {
        let command = commands::set_symbology_pdf417_only();
        let ean_disable = [0x03, 0x00, 0x00, 0x02, 0x00, 0x00];
        assert!(
            command.windows(ean_disable.len()).any(|w| w == ean_disable),
            "Should contain EAN disable sequence"
        );
    }

    #[test]
    fn set_symbology_pdf417_only_disables_interleaved_2of5() {
        let command = commands::set_symbology_pdf417_only();
        let i2of5_disable = [0x04, 0x02, 0x00, 0x01, 0x00];
        assert!(
            command
                .windows(i2of5_disable.len())
                .any(|w| w == i2of5_disable),
            "Should contain Interleaved 2 of 5 disable sequence"
        );
    }

    #[test]
    fn set_symbology_pdf417_only_disables_code93() {
        let command = commands::set_symbology_pdf417_only();
        // 0x06 gets escaped to [0x5C, 0x02]
        let code93_disable = [0x5C, 0x02, 0x00, 0x00, 0x01, 0x00];
        assert!(
            command
                .windows(code93_disable.len())
                .any(|w| w == code93_disable),
            "Should contain Code 93 disable sequence"
        );
    }

    #[test]
    fn set_symbology_pdf417_only_disables_code128() {
        let command = commands::set_symbology_pdf417_only();
        let code128_disable = [0x08, 0x00, 0x00, 0x01, 0x00];
        assert!(
            command
                .windows(code128_disable.len())
                .any(|w| w == code128_disable),
            "Should contain Code 128 disable sequence"
        );
    }

    #[test]
    fn set_symbology_pdf417_only_disables_gs1_128() {
        let command = commands::set_symbology_pdf417_only();
        let gs1_128_disable = [0x08, 0x04, 0x00, 0x01, 0x00];
        assert!(
            command
                .windows(gs1_128_disable.len())
                .any(|w| w == gs1_128_disable),
            "Should contain GS1-128 disable sequence"
        );
    }

    #[test]
    fn set_symbology_pdf417_only_disables_gs1_databar() {
        let command = commands::set_symbology_pdf417_only();
        let gs1_databar_disable = [0x20, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00];
        assert!(
            command
                .windows(gs1_databar_disable.len())
                .any(|w| w == gs1_databar_disable),
            "Should contain GS1 DataBar disable sequence"
        );
    }

    #[test]
    fn set_symbology_pdf417_only_disables_qr() {
        let command = commands::set_symbology_pdf417_only();
        let qr_disable = [0x30, 0x00, 0x00, 0x01, 0x00];
        assert!(
            command.windows(qr_disable.len()).any(|w| w == qr_disable),
            "Should contain QR disable sequence"
        );
    }

    #[test]
    fn set_symbology_pdf417_only_disables_micro_qr() {
        let command = commands::set_symbology_pdf417_only();
        let micro_qr_disable = [0x30, 0x01, 0x00, 0x01, 0x00];
        assert!(
            command
                .windows(micro_qr_disable.len())
                .any(|w| w == micro_qr_disable),
            "Should contain Micro QR disable sequence"
        );
    }

    #[test]
    fn set_symbology_pdf417_only_disables_data_matrix() {
        let command = commands::set_symbology_pdf417_only();
        let dm_disable = [0x31, 0x00, 0x00, 0x01, 0x00];
        assert!(
            command.windows(dm_disable.len()).any(|w| w == dm_disable),
            "Should contain Data Matrix disable sequence"
        );
    }

    #[test]
    fn set_symbology_pdf417_only_disables_aztec() {
        let command = commands::set_symbology_pdf417_only();
        let aztec_disable = [0x33, 0x00, 0x00, 0x01, 0x00];
        assert!(
            command
                .windows(aztec_disable.len())
                .any(|w| w == aztec_disable),
            "Should contain Aztec disable sequence"
        );
    }
}
