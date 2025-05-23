use serde::Serialize;
use std::convert::TryFrom;
use thiserror::Error;

use crate::aamva_jurisdictions::{iin_to_issuing_jurisdiction, AamvaIssuingJurisdiction};

const EXPECTED_PREFIX: &str = "ANSI ";
const ISSUER_SIZE: usize = 6;
const MIN_HEADER_LENGTH: usize = 17;

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
}

/// Partial definition of AAMVA header limited to the fields needed
/// to validate AAMVA format.
#[derive(Debug, PartialEq)]
pub struct AamvaHeader {
    raw: String,
    /// The jurisdiction that issued the document eg. US State, Washington DC, etc.
    pub issuing_jurisdiction: AamvaIssuingJurisdiction,
}

impl TryFrom<&str> for AamvaHeader {
    type Error = AamvaParseError;

    fn try_from(input: &str) -> Result<Self, Self::Error> {
        if input.len() < MIN_HEADER_LENGTH {
            return Err(Self::Error::HeaderTooShort(input.to_string()));
        }

        // 1) Validate prefix
        let actual_prefix = &input[..EXPECTED_PREFIX.len()];
        if actual_prefix != EXPECTED_PREFIX {
            return Err(AamvaParseError::UnexpectedHeaderPrefix(
                actual_prefix.to_string(),
            ));
        }

        // 2) Validate issuer ID
        let issuer_id = &input[EXPECTED_PREFIX.len()..][..ISSUER_SIZE];

        match iin_to_issuing_jurisdiction(issuer_id) {
            AamvaIssuingJurisdiction::None => Err(Self::Error::UnknownIssuingJurisdictionId(
                issuer_id.to_string(),
            )),
            issuer => Ok(AamvaHeader {
                raw: input.to_string(),
                issuing_jurisdiction: issuer,
            }),
        }
    }
}

/// Partial definition of the AAMVA document (eg. Driver's License) structure.
/// Limited to the fields needed for pollbook check-in.
#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AamvaDocument {
    pub issuing_jurisdiction: String,

    #[serde(default)]
    pub first_name: String,

    #[serde(default)]
    pub middle_name: String,

    #[serde(default)]
    pub last_name: String,

    #[serde(default)]
    pub name_suffix: String,
}

impl AamvaDocument {
    pub fn new_from_jurisdiction(issuing_jurisdiction: String) -> Self {
        Self {
            issuing_jurisdiction,
            ..Default::default()
        }
    }
}

impl TryFrom<&str> for AamvaDocument {
    type Error = AamvaParseError;

    fn try_from(input: &str) -> Result<Self, Self::Error> {
        let mut lines = input.lines();

        let header = match lines.next() {
            Some(next_line) => AamvaHeader::try_from(next_line)?,
            None => return Err(Self::Error::NoLine),
        };

        let mut document =
            Self::new_from_jurisdiction(header.issuing_jurisdiction.as_str().to_owned());

        for line in lines {
            if line.len() < 3 {
                continue;
            }

            let (id, data) = line.split_at(3);
            let value = data.trim();

            match id {
                // "DAC" => document.first_name = value.to_owned(),
                "DAC" => value.clone_into(&mut document.first_name),
                "DAD" => value.clone_into(&mut document.middle_name),
                "DCS" => value.clone_into(&mut document.last_name),
                "DCU" => value.clone_into(&mut document.name_suffix),
                _ => {} // ignore other fields
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
        let doc = AamvaDocument::try_from(VALID_BLOB).unwrap();

        assert_eq!(doc.issuing_jurisdiction, "NH");
        assert_eq!(doc.first_name, "FIRST".to_owned());
        assert_eq!(doc.middle_name, "MIDDLE".to_owned());
        assert_eq!(doc.last_name, "LAST".to_owned());
        assert_eq!(doc.name_suffix, "JR".to_owned());
    }

    #[test]
    fn missing_fields_are_none() {
        // Only header + first name
        let blob = "\
ANSI 636039090001DL00310485DLDAQNHL12345678
DACFIRST
";
        let doc = AamvaDocument::try_from(blob).unwrap();
        assert_eq!(doc.first_name, "FIRST".to_owned());
        // Everything else is still empty string
        assert!(doc.middle_name.is_empty());
        assert!(doc.last_name.is_empty());
        assert!(doc.name_suffix.is_empty());
    }

    #[test]
    fn empty_string_errors() {
        let err = AamvaDocument::try_from("").unwrap_err();
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
        let doc = AamvaDocument::try_from(blob).unwrap();
        assert_eq!(doc.first_name, "FIRST".to_owned());
        assert_eq!(doc.last_name, "LAST".to_owned());
    }

    #[test]
    fn parse_header() {
        let line = "ANSI 636039100001DL00310485DLDAQNHL12345678";
        let h = AamvaHeader::try_from(line).unwrap();
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
        let err = AamvaHeader::try_from(bad_prefix).unwrap_err();

        assert!(matches!(err, AamvaParseError::UnexpectedHeaderPrefix(_)));
    }

    #[test]
    fn too_short() {
        let err = AamvaHeader::try_from("ANSI 123").unwrap_err();
        assert!(matches!(
            err,
            AamvaParseError::HeaderTooShort(ref s) if s == "ANSI 123"
        ));
    }

    #[test]
    fn invalid_number() {
        let invalid_jurisdiction_id = "999999";
        let err = AamvaHeader::try_from(
            format!("ANSI {invalid_jurisdiction_id}100001DL00310485DLDAQNHL12345678").as_str(),
        )
        .unwrap_err();
        assert!(matches!(
            err,
            AamvaParseError::UnknownIssuingJurisdictionId(_)
        ));
    }
}
