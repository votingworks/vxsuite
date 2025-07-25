use serde::Serialize;
use std::{fmt, str::FromStr};

use crate::parse_aamva::AamvaParseError;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize)]
pub enum AamvaIssuingJurisdiction {
    // US States
    VA,
    NY,
    MA,
    MD,
    NC,
    SC,
    CT,
    LA,
    MT,
    NM,
    FL,
    DE,
    CA,
    TX,
    IA,
    CO,
    AR,
    OH,
    VT,
    PA,
    AZ,
    OR,
    MO,
    WI,
    MI,
    AL,
    ND,
    IL,
    NJ,
    IN,
    MN,
    NH,
    UT,
    ME,
    SD,
    DC,
    WA,
    KY,
    HI,
    NV,
    ID,
    MS,
    RI,
    TN,
    NE,
    GA,
    OK,
    AK,
    WY,
    WV,
    VI,

    AS, // American Samoa
    MP, // Northern Marianna Islands
    PR, // Puerto Rico
    GU, // Guam
    StateDept,
}

impl AamvaIssuingJurisdiction {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::VA => "VA",
            Self::NY => "NY",
            Self::MA => "MA",
            Self::MD => "MD",
            Self::NC => "NC",
            Self::SC => "SC",
            Self::CT => "CT",
            Self::LA => "LA",
            Self::MT => "MT",
            Self::NM => "NM",
            Self::FL => "FL",
            Self::DE => "DE",
            Self::CA => "CA",
            Self::TX => "TX",
            Self::IA => "IA",
            Self::CO => "CO",
            Self::AR => "AR",
            Self::OH => "OH",
            Self::VT => "VT",
            Self::PA => "PA",
            Self::AZ => "AZ",
            Self::OR => "OR",
            Self::MO => "MO",
            Self::WI => "WI",
            Self::MI => "MI",
            Self::AL => "AL",
            Self::ND => "ND",
            Self::IL => "IL",
            Self::NJ => "NJ",
            Self::IN => "IN",
            Self::MN => "MN",
            Self::NH => "NH",
            Self::UT => "UT",
            Self::ME => "ME",
            Self::SD => "SD",
            Self::DC => "DC",
            Self::WA => "WA",
            Self::KY => "KY",
            Self::HI => "HI",
            Self::NV => "NV",
            Self::ID => "ID",
            Self::MS => "MS",
            Self::RI => "RI",
            Self::TN => "TN",
            Self::NE => "NE",
            Self::GA => "GA",
            Self::OK => "OK",
            Self::AK => "AK",
            Self::WY => "WY",
            Self::WV => "WV",
            Self::VI => "VI",
            Self::AS => "AS",
            Self::MP => "MP",
            Self::PR => "PR",
            Self::GU => "GU",
            Self::StateDept => "StateDept",
        }
    }
}

impl fmt::Display for AamvaIssuingJurisdiction {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for AamvaIssuingJurisdiction {
    type Err = AamvaParseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            // States
            "636000" => Ok(Self::VA),
            "636001" => Ok(Self::NY),
            "636002" => Ok(Self::MA),
            "636003" => Ok(Self::MD),
            "636004" => Ok(Self::NC),
            "636005" => Ok(Self::SC),
            "636006" => Ok(Self::CT),
            "636007" => Ok(Self::LA),
            "636008" => Ok(Self::MT),
            "636009" => Ok(Self::NM),
            "636010" => Ok(Self::FL),
            "636011" => Ok(Self::DE),
            "636014" => Ok(Self::CA),
            "636015" => Ok(Self::TX),
            "636018" => Ok(Self::IA),
            "636019" => Ok(Self::GU),
            "636020" => Ok(Self::CO),
            "636021" => Ok(Self::AR),
            "636023" => Ok(Self::OH),
            "636024" => Ok(Self::VT),
            "636025" => Ok(Self::PA),
            "636026" => Ok(Self::AZ),
            "636029" => Ok(Self::OR),
            "636030" => Ok(Self::MO),
            "636031" => Ok(Self::WI),
            "636032" => Ok(Self::MI),
            "636033" => Ok(Self::AL),
            "636034" => Ok(Self::ND),
            "636035" => Ok(Self::IL),
            "636036" => Ok(Self::NJ),
            "636037" => Ok(Self::IN),
            "636038" => Ok(Self::MN),
            "636039" => Ok(Self::NH),
            "636040" => Ok(Self::UT),
            "636041" => Ok(Self::ME),
            "636042" => Ok(Self::SD),
            "636043" => Ok(Self::DC),
            "636045" => Ok(Self::WA),
            "636046" => Ok(Self::KY),
            "636047" => Ok(Self::HI),
            "636049" => Ok(Self::NV),
            "636050" => Ok(Self::ID),
            "636051" => Ok(Self::MS),
            "636052" => Ok(Self::RI),
            "636053" => Ok(Self::TN),
            "636054" => Ok(Self::NE),
            "636055" => Ok(Self::GA),
            "636058" => Ok(Self::OK),
            "636059" => Ok(Self::AK),
            "636060" => Ok(Self::WY),
            "636061" => Ok(Self::WV),
            "636062" => Ok(Self::VI),

            // U.S. territories
            "604427" => Ok(Self::AS),
            "604430" => Ok(Self::MP),
            "604431" => Ok(Self::PR),

            "636027" => Ok(Self::StateDept),

            _ => Err(Self::Err::UnknownIssuingJurisdictionId(s.to_owned())),
        }
    }
}
