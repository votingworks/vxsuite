use std::collections::HashMap;
use std::ops::Range;
use std::sync::Arc;

use krilla::geom::Point;
use krilla::surface::Surface;
use krilla::text::{Font, GlyphId, KrillaGlyph};
use parley::fontique::{Blob, Collection, CollectionOptions, SourceCache};
use parley::{
    Alignment, AlignmentOptions, FontContext, FontFamily, FontFeature, FontFeatures, FontStyle,
    FontWeight, Layout, LayoutContext, LineHeight, PositionedLayoutItem, StyleProperty,
};

use crate::doc::{BLACK, fill_rect};

pub struct Fonts {
    fcx: FontContext,
    lcx: LayoutContext<()>,
    krilla: HashMap<u64, Font>,
}

impl Fonts {
    pub fn new(data: &[Arc<Vec<u8>>]) -> Self {
        let mut collection = Collection::new(CollectionOptions {
            shared: false,
            system_fonts: false,
        });
        for d in data {
            collection.register_fonts(
                Blob::new(d.clone() as Arc<dyn AsRef<[u8]> + Send + Sync>),
                None,
            );
        }
        Fonts {
            fcx: FontContext {
                collection,
                source_cache: SourceCache::default(),
            },
            lcx: LayoutContext::new(),
            krilla: HashMap::new(),
        }
    }
}

#[derive(Clone, Copy, Default, PartialEq)]
pub struct SpanStyle {
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub strike: bool,
}

#[derive(Clone, Copy, PartialEq)]
pub enum Align {
    Left,
    Center,
    Right,
}

pub struct TextBlock {
    pub text: String,
    pub spans: Vec<(Range<usize>, SpanStyle)>,
    pub size: f32,
    pub base: SpanStyle,
    pub line_height: f32,
    pub align: Align,
    /// List marker drawn outside the block, ending at its left edge.
    pub marker: Option<String>,
    layout: Option<Layout<()>>,
    marker_layout: Option<Layout<()>>,
    broken_at: Option<Option<f32>>,
}

impl TextBlock {
    pub fn new(text: impl Into<String>, size: f32, bold: bool) -> Self {
        TextBlock {
            text: text.into(),
            spans: vec![],
            size,
            base: SpanStyle {
                bold,
                ..Default::default()
            },
            line_height: 1.2,
            align: Align::Left,
            marker: None,
            layout: None,
            marker_layout: None,
            broken_at: None,
        }
    }

    pub fn align(mut self, a: Align) -> Self {
        self.align = a;
        self
    }

    fn build(
        &self,
        fonts: &mut Fonts,
        text: &str,
        spans: &[(Range<usize>, SpanStyle)],
    ) -> Layout<()> {
        let mut b = fonts.lcx.ranged_builder(&mut fonts.fcx, text, 1.0, false);
        b.set_line_break_override(Some(parley::CHROMIUM_LINE_BREAK_OVERRIDE));
        b.push_default(StyleProperty::FontFamily(FontFamily::from("Roboto")));
        b.push_default(StyleProperty::FontSize(self.size));
        // Unlike the Chromium template, never let an unbreakable run widen its column (and the page).
        b.push_default(StyleProperty::OverflowWrap(parley::OverflowWrap::BreakWord));
        b.push_default(StyleProperty::LineHeight(LineHeight::FontSizeRelative(
            self.line_height,
        )));
        b.push_default(StyleProperty::FontFeatures(FontFeatures::List(
            vec![
                FontFeature::new(parley::setting::Tag::new(b"liga"), 0),
                FontFeature::new(parley::setting::Tag::new(b"clig"), 0),
            ]
            .into(),
        )));
        let apply = |b: &mut parley::RangedBuilder<'_, ()>, st: SpanStyle, r: Range<usize>| {
            if st.bold {
                b.push(StyleProperty::FontWeight(FontWeight::BOLD), r.clone());
            }
            if st.italic {
                b.push(StyleProperty::FontStyle(FontStyle::Italic), r.clone());
            }
            if st.underline {
                b.push(StyleProperty::Underline(true), r.clone());
            }
            if st.strike {
                b.push(StyleProperty::Strikethrough(true), r);
            }
        };
        apply(&mut b, self.base, 0..text.len());
        for (r, st) in spans {
            apply(&mut b, *st, r.clone());
        }
        b.build(text)
    }

    fn ensure(&mut self, fonts: &mut Fonts, max_w: Option<f32>) {
        if self.layout.is_none() {
            self.layout = Some(self.build(fonts, &self.text, &self.spans));
            if let Some(m) = &self.marker {
                let mut ml = self.build(fonts, m, &[]);
                ml.break_all_lines(None);
                self.marker_layout = Some(ml);
            }
        }
        if self.broken_at != Some(max_w) {
            let l = self.layout.as_mut().unwrap();
            // Tiny epsilon: CSS widths that exactly fit a line shouldn't wrap from float error.
            l.break_all_lines(max_w.map(|w| w + 0.01));
            self.broken_at = Some(max_w);
        }
    }

    /// Size when wrapped at `max_w`; `Some(0.0)` means min-content (break only at soft wrap opportunities).
    pub fn measure(&mut self, fonts: &mut Fonts, max_w: Option<f32>) -> (f32, f32) {
        if self.text.is_empty() {
            return (0.0, 0.0);
        }
        let max_w = match max_w {
            Some(w) if w <= 0.0 => {
                self.ensure(fonts, None);
                Some(self.layout.as_ref().unwrap().calculate_content_widths().min)
            }
            w => w,
        };
        self.ensure(fonts, max_w);
        let l = self.layout.as_ref().unwrap();
        (l.width(), l.height())
    }

    pub fn draw(&mut self, fonts: &mut Fonts, s: &mut Surface, x: f32, y: f32, width: f32) {
        if self.text.is_empty() {
            return;
        }
        self.ensure(fonts, Some(width));
        let align = self.align;
        let l = self.layout.as_mut().unwrap();
        let a = match align {
            Align::Left => Alignment::Start,
            Align::Center => Alignment::Center,
            Align::Right => Alignment::End,
        };
        l.align(
            a,
            AlignmentOptions {
                align_when_overflowing: true,
                ..Default::default()
            },
        );
        let l = self.layout.as_ref().unwrap();
        draw_layout(fonts, s, l, &self.text, x, y);
        if let (Some(m), Some(ml), Some(line)) =
            (&self.marker, &self.marker_layout, l.lines().next())
        {
            let baseline = y + line.metrics().baseline;
            let marker_baseline = ml.lines().next().unwrap().metrics().baseline;
            draw_layout(
                fonts,
                s,
                ml,
                m,
                x - ml.full_width(),
                baseline - marker_baseline,
            );
        }
    }
}

fn draw_layout(fonts: &mut Fonts, s: &mut Surface, l: &Layout<()>, text: &str, x: f32, y: f32) {
    for line in l.lines() {
        let mut drawn_runs = vec![];
        for item in line.items() {
            let PositionedLayoutItem::GlyphRun(glyph_run) = item else {
                continue;
            };
            let (gx, baseline) = (x + glyph_run.offset(), y + glyph_run.baseline());
            let run = glyph_run.run();
            let m = run.font_metrics();
            if glyph_run.style().underline.is_some() {
                fill_rect(
                    s,
                    gx,
                    baseline - m.underline_offset,
                    glyph_run.advance(),
                    m.underline_size,
                    BLACK,
                );
            }
            if glyph_run.style().strikethrough.is_some() {
                fill_rect(
                    s,
                    gx,
                    baseline - m.strikethrough_offset,
                    glyph_run.advance(),
                    m.strikethrough_size,
                    BLACK,
                );
            }
            // Glyph runs split a shaped run by style; draw each shaped run once, from its leftmost glyph run.
            if drawn_runs.contains(&run.index()) {
                continue;
            }
            drawn_runs.push(run.index());
            let font_data = run.font();
            let font = fonts
                .krilla
                .entry(font_data.data.id())
                .or_insert_with(|| {
                    Font::new(font_data.data.data().to_vec().into(), font_data.index).unwrap()
                })
                .clone();
            let size = run.font_size();
            let glyphs: Vec<KrillaGlyph> = run
                .visual_clusters()
                .flat_map(|c| {
                    let range = c.text_range();
                    c.glyphs().map(move |g| KrillaGlyph {
                        glyph_id: GlyphId::new(g.id),
                        text_range: range.clone(),
                        x_advance: g.advance / size,
                        x_offset: g.x / size,
                        y_offset: g.y / size,
                        y_advance: 0.0,
                        location: None,
                    })
                })
                .collect();
            s.set_stroke(None);
            s.set_fill(Some(krilla::paint::Fill::default()));
            s.draw_glyphs(
                Point::from_xy(gx, baseline),
                &glyphs,
                font,
                text,
                size,
                false,
            );
        }
    }
}
