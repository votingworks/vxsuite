use std::ffi::c_char;

pub(crate) fn string_from_c_char_slice(bytes: &[c_char]) -> String {
    let mut string = String::with_capacity(bytes.len());
    for byte in bytes {
        if *byte == 0 {
            break;
        }
        string.push(*byte as u8 as char);
    }
    string
}
