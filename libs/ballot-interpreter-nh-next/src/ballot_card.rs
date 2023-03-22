use std::{fmt::Debug, hash::Hash, io};

use image::{GrayImage, Luma};
use imageproc::contrast::{otsu_level, threshold};
use logging_timer::time;
use serde::{Deserialize, Serialize};

use crate::{
    geometry::{GridUnit, PixelUnit, Rect, Size, SubPixelUnit},
    image_utils::bleed,
};

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize)]
pub enum BallotPaperSize {
    #[serde(rename = "letter")]
    Letter,
    #[serde(rename = "legal")]
    Legal,
}

/// Ballot card orientation.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize)]
pub enum Orientation {
    /// The ballot card is portrait and right-side up.
    #[serde(rename = "portrait")]
    Portrait,

    /// The ballot card is portrait and upside down.
    #[serde(rename = "portrait-reversed")]
    PortraitReversed,
}

#[derive(Copy, Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Geometry {
    pub ballot_paper_size: BallotPaperSize,
    pub pixels_per_inch: PixelUnit,
    pub canvas_size: Size<PixelUnit>,
    pub content_area: Rect,
    pub oval_size: Size<PixelUnit>,
    pub timing_mark_size: Size<SubPixelUnit>,
    pub grid_size: Size<GridUnit>,
    pub front_usable_area: Rect,
    pub back_usable_area: Rect,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
pub enum BallotSide {
    #[serde(rename = "front")]
    Front,
    #[serde(rename = "back")]
    Back,
}

pub const fn get_scanned_ballot_card_geometry_8pt5x11() -> Geometry {
    Geometry {
        ballot_paper_size: BallotPaperSize::Letter,
        pixels_per_inch: 200,
        canvas_size: Size {
            width: 1696,
            height: 2200,
        },
        content_area: Rect::new(0, 0, 1696, 2200),
        oval_size: Size {
            width: 40,
            height: 26,
        },
        timing_mark_size: Size {
            width: 37.5,
            height: 12.5,
        },
        grid_size: Size {
            width: 34,
            height: 41,
        },
        front_usable_area: Rect::new(0, 0, 34, 41),
        back_usable_area: Rect::new(0, 0, 34, 41),
    }
}

pub const fn get_scanned_ballot_card_geometry_8pt5x14() -> Geometry {
    Geometry {
        ballot_paper_size: BallotPaperSize::Legal,
        pixels_per_inch: 200,
        canvas_size: Size {
            width: 1696,
            height: 2800,
        },
        content_area: Rect::new(0, 0, 1696, 2800),
        oval_size: Size {
            width: 40,
            height: 26,
        },
        timing_mark_size: Size {
            width: 37.5,
            height: 12.5,
        },
        grid_size: Size {
            width: 34,
            height: 53,
        },
        front_usable_area: Rect::new(0, 0, 34, 53),
        back_usable_area: Rect::new(0, 0, 34, 53),
    }
}

pub fn get_scanned_ballot_card_geometry(size: (PixelUnit, PixelUnit)) -> Option<Geometry> {
    let (width, height) = size;
    let aspect_ratio = width as SubPixelUnit / height as SubPixelUnit;
    let letter_size = get_scanned_ballot_card_geometry_8pt5x11();
    let letter_aspect_ratio = letter_size.canvas_size.width as SubPixelUnit
        / letter_size.canvas_size.height as SubPixelUnit;
    let legal_size = get_scanned_ballot_card_geometry_8pt5x14();
    let legal_aspect_ratio = legal_size.canvas_size.width as SubPixelUnit
        / legal_size.canvas_size.height as SubPixelUnit;

    if (aspect_ratio - letter_aspect_ratio).abs() < 0.05 {
        Some(letter_size)
    } else if (aspect_ratio - legal_aspect_ratio).abs() < 0.05 {
        Some(legal_size)
    } else {
        None
    }
}

#[time]
pub fn load_oval_template() -> Option<GrayImage> {
    let oval_scan_bytes = include_bytes!("../data/oval_scan.png");
    let inner = io::Cursor::new(oval_scan_bytes);
    let oval_scan_image = match image::load(inner, image::ImageFormat::Png).ok() {
        Some(image) => image.to_luma8(),
        _ => return None,
    };
    Some(bleed(
        &threshold(&oval_scan_image, otsu_level(&oval_scan_image)),
        Luma([0u8]),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_scanned_ballot_card_geometry() {
        assert_eq!(
            get_scanned_ballot_card_geometry((1696, 2200)),
            Some(get_scanned_ballot_card_geometry_8pt5x11())
        );
        assert_eq!(
            get_scanned_ballot_card_geometry((1696, 2800)),
            Some(get_scanned_ballot_card_geometry_8pt5x14())
        );
        assert_eq!(get_scanned_ballot_card_geometry((1500, 1500)), None);
    }

    #[test]
    fn test_load_oval_template() {
        assert!(load_oval_template().is_some());
    }

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
