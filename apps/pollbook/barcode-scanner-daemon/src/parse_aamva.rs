use serde::Serialize;
use std::str::FromStr;
use thiserror::Error;

use crate::aamva_jurisdictions::AamvaIssuingJurisdiction;

const EXPECTED_PREFIX: &str = "ANSI ";
const ISSUER_SIZE: usize = 6;
const MIN_HEADER_LENGTH: usize = 17;
const MAX_NAME_LENGTH: usize = 40;
const MAX_NAME_SUFFIX_LENGTH: usize = 5;

#[derive(Debug, Error)]
pub enum AamvaParseError {
    #[error("No line available in passed iterator")]
    NoLine,

    #[error("Header input too short. Value: '{0}'")]
    HeaderTooShort(String),

    #[error("Unexpected header prefix. Expected '{EXPECTED_PREFIX}', got '{0}")]
    UnexpectedHeaderPrefix(String),

    #[error("Unknown issuing jurisdiction ID: {0}")]
    UnknownIssuingJurisdictionId(String),

    #[error("Data in element {0} too long: {1}")]
    DataTooLong(String, String),
}

/// Partial definition of AAMVA header limited to the fields needed
/// to validate AAMVA format.
#[derive(Debug, PartialEq)]
pub struct AamvaHeader {
    raw: String,
    /// The jurisdiction that issued the document eg. US State, Washington DC, etc.
    pub issuing_jurisdiction: AamvaIssuingJurisdiction,
}

impl FromStr for AamvaHeader {
    type Err = AamvaParseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        if s.len() < MIN_HEADER_LENGTH {
            return Err(Self::Err::HeaderTooShort(s.to_owned()));
        }

        // 1) Validate prefix
        let actual_prefix = &s[..EXPECTED_PREFIX.len()];
        if actual_prefix != EXPECTED_PREFIX {
            return Err(AamvaParseError::UnexpectedHeaderPrefix(
                actual_prefix.to_owned(),
            ));
        }

        // 2) Validate issuer ID
        Ok(AamvaHeader {
            raw: s.to_owned(),
            issuing_jurisdiction: s[EXPECTED_PREFIX.len()..][..ISSUER_SIZE].parse()?,
        })
    }
}

/// Partial definition of the AAMVA document (eg. Driver's License) structure.
/// Limited to the fields needed for pollbook check-in.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AamvaDocument {
    pub issuing_jurisdiction: AamvaIssuingJurisdiction,

    pub first_name: String,

    pub middle_name: String,

    pub last_name: String,

    pub name_suffix: String,
}

impl AamvaDocument {
    pub fn new_from_jurisdiction(issuing_jurisdiction: AamvaIssuingJurisdiction) -> Self {
        Self {
            issuing_jurisdiction,
            first_name: String::new(),
            middle_name: String::new(),
            last_name: String::new(),
            name_suffix: String::new(),
        }
    }
}

impl FromStr for AamvaDocument {
    type Err = AamvaParseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let mut lines = s.lines();

        let header: AamvaHeader = match lines.next() {
            Some(next_line) => next_line.parse()?,
            None => return Err(Self::Err::NoLine),
        };

        let mut document = Self::new_from_jurisdiction(header.issuing_jurisdiction);

        for line in lines {
            if line.len() < 3 {
                continue;
            }

            let (id, data) = line.split_at(3);

            match id {
                "DAC" => {
                    if data.len() > MAX_NAME_LENGTH {
                        return Err(Self::Err::DataTooLong(id.to_string(), data.to_string()));
                    }
                    document.first_name = data.to_owned();
                }
                "DAD" => {
                    if data.len() > MAX_NAME_LENGTH {
                        return Err(Self::Err::DataTooLong(id.to_string(), data.to_string()));
                    }
                    document.middle_name = data.to_owned();
                }
                "DCS" => {
                    if data.len() > MAX_NAME_LENGTH {
                        return Err(Self::Err::DataTooLong(id.to_string(), data.to_string()));
                    }
                    document.last_name = data.to_owned();
                }
                "DCU" => {
                    if data.len() > MAX_NAME_SUFFIX_LENGTH {
                        return Err(Self::Err::DataTooLong(id.to_string(), data.to_string()));
                    }
                    document.name_suffix = data.to_owned();
                }
                _ => {}
            }
        }

        Ok(document)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID_BLOB: &str = "\
        ANSI 636039090001DL00310485DLDAQNHL12345678
DACFIRST
DADMIDDLE
DCSLAST
DCUJR
";

    #[test]
    fn parse_complete_document() {
        let doc = AamvaDocument::from_str(VALID_BLOB).unwrap();

        assert_eq!(doc.issuing_jurisdiction, AamvaIssuingJurisdiction::NH);
        assert_eq!(&doc.first_name, "FIRST");
        assert_eq!(&doc.middle_name, "MIDDLE");
        assert_eq!(&doc.last_name, "LAST");
        assert_eq!(&doc.name_suffix, "JR");
    }

    #[test]
    fn missing_fields_are_none() {
        // Only header + first name
        let blob = "\
ANSI 636039090001DL00310485DLDAQNHL12345678
DACFIRST
";
        let doc: AamvaDocument = blob.parse().unwrap();
        assert_eq!(&doc.first_name, "FIRST");
        assert!(
            doc.middle_name.is_empty(),
            "Middle name not empty: {}",
            doc.middle_name
        );
        assert!(
            doc.last_name.is_empty(),
            "Last name not empty: {}",
            doc.last_name
        );
        assert!(
            doc.name_suffix.is_empty(),
            "Suffix not empty: {}",
            doc.name_suffix
        );
    }

    #[test]
    fn empty_string_errors() {
        let err = AamvaDocument::from_str("").unwrap_err();
        assert!(matches!(err, AamvaParseError::NoLine));
    }

    #[test]
    fn ignore_extra_lines() {
        let blob = "\
            ANSI 636039090001DL00310485DLDAQNHL12345678
XYZEXTRAVALUE
DACFIRST
DCSLAST
";
        let doc = AamvaDocument::from_str(blob).unwrap();
        assert_eq!(doc.first_name, "FIRST".to_owned());
        assert_eq!(doc.last_name, "LAST".to_owned());
    }

    #[test]
    fn parse_header() {
        let line = "ANSI 636039100001DL00310485DLDAQNHL12345678";
        let h = AamvaHeader::from_str(line).unwrap();
        assert_eq!(
            h,
            AamvaHeader {
                raw: line.to_string(),
                issuing_jurisdiction: AamvaIssuingJurisdiction::NH
            }
        );
    }

    #[test]
    fn unexpected_prefix() {
        let bad_prefix = "1234 636039100001DL00310485DLDAQNHL12345678";
        let err = AamvaHeader::from_str(bad_prefix).unwrap_err();

        assert!(matches!(err, AamvaParseError::UnexpectedHeaderPrefix(_)));
    }

    #[test]
    fn header_too_short() {
        let err = AamvaHeader::from_str("ANSI 123").unwrap_err();
        assert!(matches!(
            err,
            AamvaParseError::HeaderTooShort(ref s) if s == "ANSI 123"
        ));
    }

    #[test]
    fn data_too_long() {
        let long_data: &str = "FORTY-ONE-CHARS-STRING-IS-TOOOOOOOOO-LONG";
        let element_ids = ["DAC", "DAD", "DCS", "DCU"];
        for id in element_ids {
            let too_long: &str =
                &format!("ANSI 636039090001DL00310485DLDAQNHL12345678\n{id}{long_data}").to_owned();
            let _ = AamvaDocument::from_str(too_long).expect_err(
                &format!(
                    "Data in element {id} too long: FORTY-ONE-CHARS-STRING-IS-TOOOOOOOOO-LONG"
                )
                .to_owned(),
            );
        }
    }

    #[test]
    fn invalid_number() {
        let invalid_jurisdiction_id = "999999";
        let err = AamvaHeader::from_str(
            format!("ANSI {invalid_jurisdiction_id}100001DL00310485DLDAQNHL12345678").as_str(),
        )
        .unwrap_err();
        assert!(matches!(
            err,
            AamvaParseError::UnknownIssuingJurisdictionId(_)
        ));
    }
}
