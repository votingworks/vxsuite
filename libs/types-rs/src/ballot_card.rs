use std::fmt::Debug;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
pub enum BallotSide {
    #[serde(rename = "front")]
    Front,
    #[serde(rename = "back")]
    Back,
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn test_ballot_side_deserialize() {
        assert_eq!(
            serde_json::from_str::<BallotSide>(r#""front""#).unwrap(),
            BallotSide::Front
        );
        assert_eq!(
            serde_json::from_str::<BallotSide>(r#""back""#).unwrap(),
            BallotSide::Back
        );
        assert!(serde_json::from_str::<BallotSide>(r#""foo""#).is_err());
    }

    #[test]
    fn test_ballot_side_serialize() {
        assert_eq!(
            serde_json::to_string(&BallotSide::Front).unwrap(),
            r#""front""#
        );
        assert_eq!(
            serde_json::to_string(&BallotSide::Back).unwrap(),
            r#""back""#
        );
    }
}
