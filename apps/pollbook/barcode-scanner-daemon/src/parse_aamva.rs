use chrono::{prelude::*, ParseError};
use core::fmt;
use serde::ser::Serializer;
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

    #[error("Could not parse {0} as date: {1}")]
    DateParse(String, ParseError),
}

/// Serialize `Option<String>` or `Option<NaiveDate>` as a JSON string,
/// using `""` when it’s `None`.
fn empty_string_for_none<S>(opt: &Option<impl ToString>, ser: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    match opt {
        Some(v) => ser.serialize_str(&v.to_string()),
        None => ser.serialize_str(""),
    }
}

/// Partial definition of AAMVA header limited to the fields needed
/// to validate AAMVA format.
#[derive(Debug, PartialEq)]
pub struct AamvaHeader {
    raw: String,
    /// The jurisdiction that issued the document eg. US State, Washington DC, etc.
    pub issuing_jurisdiction: AamvaIssuingJurisdiction,
}

impl fmt::Display for AamvaHeader {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(
            f,
            "raw: {}, issuing_jurisdiction: {}",
            self.raw, self.issuing_jurisdiction
        )
    }
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
        let issuer_start_index = EXPECTED_PREFIX.len();
        let issuer_id = &input[issuer_start_index..issuer_start_index + ISSUER_SIZE];

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
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AamvaDocument {
    pub issuing_jurisdiction: String,

    #[serde(serialize_with = "empty_string_for_none")]
    pub first_name: Option<String>,

    #[serde(serialize_with = "empty_string_for_none")]
    pub middle_name: Option<String>,

    #[serde(serialize_with = "empty_string_for_none")]
    pub last_name: Option<String>,

    #[serde(serialize_with = "empty_string_for_none")]
    pub name_suffix: Option<String>,

    #[serde(serialize_with = "empty_string_for_none")]
    pub expiration: Option<NaiveDate>,
}

impl TryFrom<&str> for AamvaDocument {
    type Error = AamvaParseError;

    fn try_from(input: &str) -> Result<Self, Self::Error> {
        let mut lines = input.lines();

        let next_line = lines.next();
        if next_line.is_none() {
            return Err(Self::Error::NoLine);
        }
        let header = AamvaHeader::try_from(next_line.unwrap())?;

        let mut document: AamvaDocument = AamvaDocument {
            issuing_jurisdiction: header.issuing_jurisdiction.as_str().to_string(),
            first_name: None,
            middle_name: None,
            last_name: None,
            name_suffix: None,
            expiration: None,
        };

        for line in lines {
            if line.len() < 3 {
                continue;
            }

            let (id, data) = line.split_at(3);
            let value = data.trim();

            match id {
                "DAC" => document.first_name = Some(value.to_string()),
                "DAD" => document.middle_name = Some(value.to_string()),
                "DCS" => document.last_name = Some(value.to_string()),
                "DCU" => document.name_suffix = Some(value.to_string()),

                // DBA is expiration in MMDDYYYY
                "DBA" => match NaiveDate::parse_from_str(value, "%m%d%Y") {
                    Ok(date) => document.expiration = Some(date),
                    Err(e) => return Err(Self::Error::DateParse(value.to_string(), e)),
                },

                _ => {} // ignore other fields
            }
        }

        println!(
            "Scanned ID for: {:?} {:?}",
            document.first_name, document.last_name
        );
        Ok(document)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    const VALID_BLOB: &str = "\
        ANSI 636039090001DL00310485DLDAQNHL12345678
DACFIRST
DADMIDDLE
DCSLAST
DCUJR
DBA01012030
";

    #[test]
    fn parse_complete_document() {
        let doc = AamvaDocument::try_from(VALID_BLOB).unwrap();

        assert_eq!(doc.issuing_jurisdiction, "NH");
        assert_eq!(doc.first_name, Some("FIRST".to_string()));
        assert_eq!(doc.middle_name, Some("MIDDLE".to_string()));
        assert_eq!(doc.last_name, Some("LAST".to_string()));
        assert_eq!(doc.name_suffix, Some("JR".to_string()));

        assert_eq!(
            doc.expiration,
            Some(NaiveDate::from_ymd_opt(2030, 1, 1).unwrap())
        );
    }

    #[test]
    fn missing_fields_are_none() {
        // Only header + first name
        let blob = "\
ANSI 636039090001DL00310485DLDAQNHL12345678
DACJANE
";
        let doc = AamvaDocument::try_from(blob).unwrap();
        assert_eq!(doc.first_name, Some("JANE".to_string()));
        // Everything else is still None
        assert!(doc.middle_name.is_none());
        assert!(doc.last_name.is_none());
        assert!(doc.name_suffix.is_none());
        assert!(doc.expiration.is_none());
    }

    #[test]
    fn input_too_short_errors() {
        let err = AamvaDocument::try_from("").unwrap_err();
        assert!(matches!(
            err,
            AamvaParseError::HeaderTooShort(ref s) if s == ""
        ));
    }

    #[test]
    fn date_parse_error_bubbles_up() {
        // Invalid DBA line
        let blob = "\
ANSI 636039090001DL00310485DLDAQNHL12345678
DBA111012030
";
        let err = AamvaDocument::try_from(blob).unwrap_err();
        assert!(matches!(
            err,
            AamvaParseError::DateParse(ref s, _)
                if s == "111012030"
        ));
    }

    #[test]
    fn ignore_extra_lines() {
        let blob = "\
            ANSI 636039090001DL00310485DLDAQNHL12345678
XYZEXTRAVALUE
DACFIRST
DCSLAST
DBA12312030
";
        let doc = AamvaDocument::try_from(blob).unwrap();
        assert_eq!(doc.first_name, Some("FIRST".to_string()));
        assert_eq!(doc.last_name, Some("LAST".to_string()));
        assert_eq!(
            doc.expiration,
            Some(NaiveDate::from_ymd_opt(2030, 12, 31).unwrap())
        );
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
