//! A tiny CSS-box document: taffy for block/flex/grid layout, parley for text, krilla for paint.
use std::sync::Arc;

use krilla::color::rgb;
use krilla::geom::{PathBuilder, Rect as KRect, Transform};
use krilla::paint::{Fill, Stroke};
use krilla::surface::Surface;
use krilla_svg::{SurfaceExt, SvgSettings};
use taffy::AvailableSpace;
use taffy::prelude::*;

use crate::text::{Fonts, TextBlock};

pub type Color = (u8, u8, u8);
pub const BLACK: Color = (0, 0, 0);

/// Roboto's hhea ascent and descent, per em.
const ROBOTO_ASCENT: f32 = 2163.0 / 2048.0;
const ROBOTO_DESCENT: f32 = 595.0 / 2048.0;

/// Space an inline image leaves below itself: the line box extends past its baseline by the strut's descent.
pub fn strut_below_baseline(font_size: f32, line_height: f32) -> f32 {
    let half_leading = (line_height - ROBOTO_ASCENT - ROBOTO_DESCENT) * font_size / 2.0;
    ROBOTO_DESCENT * font_size + half_leading
}

#[derive(Clone, Debug)]
pub enum Tag {
    None,
    TimingMark,
    ContentSlot,
    QrSlot,
    PageContent,
    Bubble(String),
    Measure(usize),
}

#[derive(Clone, Copy, Default)]
pub struct Borders {
    pub top: Option<(f32, Color)>,
    pub right: Option<(f32, Color)>,
    pub bottom: Option<(f32, Color)>,
    pub left: Option<(f32, Color)>,
}

impl Borders {
    pub fn all(w: f32, c: Color) -> Self {
        Self {
            top: Some((w, c)),
            right: Some((w, c)),
            bottom: Some((w, c)),
            left: Some((w, c)),
        }
    }
}

pub enum Picture {
    Svg(Arc<usvg::Tree>),
    Raster(krilla::image::Image),
}

impl Picture {
    pub fn size(&self) -> (f32, f32) {
        match self {
            Picture::Svg(t) => (t.size().width(), t.size().height()),
            Picture::Raster(i) => (i.size().0 as f32, i.size().1 as f32),
        }
    }
}

pub struct Svg {
    pub tree: Picture,
    /// Extra space below the image, for inline images sitting on a line box baseline.
    pub inline_gap: f32,
    /// Text drawn over the SVG in its user space (stand-in for `<foreignObject>`).
    pub overlay: Option<(f32, f32, TextBlock)>,
}

pub enum Content {
    None,
    Text(TextBlock),
    Svg(Svg),
    Qr(String),
    Table(Box<Table>),
}

/// An HTML table laid out with the auto table-layout algorithm (no colspan/rowspan).
pub struct Table {
    doc: Doc,
    grid: NodeId,
    cells: Vec<(usize, NodeId)>,
    ncols: usize,
    border: f32,
    col_min_max: Option<(Vec<f32>, Vec<f32>)>,
}

impl Table {
    /// `grid` is a grid element whose children are cells; `cols[i]` is child i's column.
    pub fn new(grid: El, cols: Vec<usize>, border: f32) -> Self {
        let mut doc = Doc::new();
        let ncols = cols.iter().max().map_or(0, |m| m + 1);
        let grid = doc.add(grid);
        let cells = cols
            .into_iter()
            .zip(doc.tree.children(grid).unwrap())
            .collect();
        Table {
            doc,
            grid,
            cells,
            ncols,
            border,
            col_min_max: None,
        }
    }

    fn min_max(&mut self, fonts: &mut Fonts) -> (Vec<f32>, Vec<f32>) {
        if self.col_min_max.is_none() {
            let (mut mins, mut maxs) = (vec![0f32; self.ncols], vec![0f32; self.ncols]);
            for &(col, cell) in &self.cells {
                for (space, out) in [
                    (AvailableSpace::MinContent, &mut mins),
                    (AvailableSpace::MaxContent, &mut maxs),
                ] {
                    self.doc.compute_with(
                        fonts,
                        cell,
                        Size {
                            width: space,
                            height: AvailableSpace::MaxContent,
                        },
                    );
                    out[col] = out[col].max(self.doc.tree.layout(cell).unwrap().size.width);
                }
            }
            self.col_min_max = Some((mins, maxs));
        }
        self.col_min_max.clone().unwrap()
    }

    /// Returns (width, height) for the given available width.
    fn layout(&mut self, fonts: &mut Fonts, avail: AvailableSpace) -> (f32, f32) {
        let (mins, maxs) = self.min_max(fonts);
        let (sum_min, sum_max): (f32, f32) = (mins.iter().sum(), maxs.iter().sum());
        let target = match avail {
            AvailableSpace::Definite(w) => (w - self.border).clamp(sum_min, sum_max),
            AvailableSpace::MinContent => sum_min,
            AvailableSpace::MaxContent => sum_max,
        };
        let widths: Vec<f32> = if sum_max <= sum_min {
            maxs
        } else {
            let t = (target - sum_min) / (sum_max - sum_min);
            mins.iter()
                .zip(&maxs)
                .map(|(mn, mx)| mn + (mx - mn) * t)
                .collect()
        };
        let mut style = self.doc.tree.style(self.grid).unwrap().clone();
        style.grid_template_columns = widths.iter().map(|&w| length(w)).collect();
        style.size.width = length(target + self.border);
        self.doc.tree.set_style(self.grid, style).unwrap();
        self.doc.compute(fonts, self.grid, None);
        let size = self.doc.tree.layout(self.grid).unwrap().size;
        (size.width, size.height)
    }
}

pub struct NodeData {
    pub tag: Tag,
    pub background: Option<Color>,
    pub borders: Borders,
    pub radius: f32,
    pub hidden: bool,
    pub content: Content,
}

impl Default for NodeData {
    fn default() -> Self {
        Self {
            tag: Tag::None,
            background: None,
            borders: Borders::default(),
            radius: 0.0,
            hidden: false,
            content: Content::None,
        }
    }
}

pub struct Doc {
    pub tree: TaffyTree<NodeData>,
}

pub struct El {
    pub style: Style,
    pub data: NodeData,
    pub children: Vec<El>,
}

impl El {
    pub fn new(style: Style) -> Self {
        El {
            style,
            data: NodeData::default(),
            children: vec![],
        }
    }
    pub fn child(mut self, c: El) -> Self {
        self.children.push(c);
        self
    }
    pub fn children(mut self, cs: impl IntoIterator<Item = El>) -> Self {
        self.children.extend(cs);
        self
    }
    pub fn bg(mut self, c: Color) -> Self {
        self.data.background = Some(c);
        self
    }
    pub fn borders(mut self, b: Borders) -> Self {
        for (side, w) in [
            (&b.top, &mut self.style.border.top),
            (&b.right, &mut self.style.border.right),
            (&b.bottom, &mut self.style.border.bottom),
            (&b.left, &mut self.style.border.left),
        ] {
            if let Some((bw, _)) = side {
                *w = length(*bw);
            }
        }
        self.data.borders = b;
        self
    }
    pub fn tag(mut self, t: Tag) -> Self {
        self.data.tag = t;
        self
    }
    pub fn content(mut self, c: Content) -> Self {
        self.data.content = c;
        self
    }
}

pub fn block() -> Style {
    Style {
        display: Display::Block,
        ..Default::default()
    }
}

pub fn flex_row(gap: f32) -> Style {
    Style {
        display: Display::Flex,
        flex_direction: FlexDirection::Row,
        gap: Size {
            width: length(gap),
            height: length(gap),
        },
        ..Default::default()
    }
}

pub fn flex_col(gap: f32) -> Style {
    Style {
        display: Display::Flex,
        flex_direction: FlexDirection::Column,
        gap: Size {
            width: length(gap),
            height: length(gap),
        },
        ..Default::default()
    }
}

pub fn pad(t: f32, r: f32, b: f32, l: f32) -> taffy::Rect<LengthPercentage> {
    taffy::Rect {
        top: length(t),
        right: length(r),
        bottom: length(b),
        left: length(l),
    }
}

impl Doc {
    pub fn new() -> Self {
        let mut tree = TaffyTree::new();
        tree.disable_rounding();
        Doc { tree }
    }

    pub fn add(&mut self, el: El) -> NodeId {
        let children: Vec<NodeId> = el.children.into_iter().map(|c| self.add(c)).collect();
        let id = self.tree.new_leaf_with_context(el.style, el.data).unwrap();
        self.tree.set_children(id, &children).unwrap();
        id
    }

    pub fn compute(&mut self, fonts: &mut Fonts, root: NodeId, width: Option<f32>) {
        let avail = Size {
            width: width.map_or(AvailableSpace::MaxContent, AvailableSpace::Definite),
            height: AvailableSpace::MaxContent,
        };
        self.compute_with(fonts, root, avail);
    }

    pub fn compute_with(&mut self, fonts: &mut Fonts, root: NodeId, avail: Size<AvailableSpace>) {
        self.tree
            .compute_layout_with_measure(root, avail, |inputs, _id, ctx, style| {
                taffy::compute_leaf_layout(
                    inputs,
                    style,
                    |_, _| 0.0,
                    |known, avail| measure(fonts, known, avail, ctx),
                )
            })
            .unwrap();
    }

    /// Absolute border-box rect of every node with a matching tag.
    pub fn find(
        &self,
        root: NodeId,
        pred: &dyn Fn(&Tag) -> bool,
    ) -> Vec<(Tag, f32, f32, f32, f32)> {
        let mut out = vec![];
        self.walk(root, 0.0, 0.0, &mut |id, x, y, l| {
            let d = self.tree.get_node_context(id).unwrap();
            if pred(&d.tag) {
                out.push((d.tag.clone(), x, y, l.size.width, l.size.height));
            }
        });
        out
    }

    fn walk(
        &self,
        id: NodeId,
        ox: f32,
        oy: f32,
        f: &mut dyn FnMut(NodeId, f32, f32, &taffy::Layout),
    ) {
        let l = self.tree.layout(id).unwrap();
        let (x, y) = (ox + l.location.x, oy + l.location.y);
        f(id, x, y, l);
        for c in self.tree.children(id).unwrap() {
            self.walk(c, x, y, f);
        }
    }

    pub fn paint(&mut self, fonts: &mut Fonts, s: &mut Surface, root: NodeId) {
        let mut items = vec![];
        self.walk(root, 0.0, 0.0, &mut |id, x, y, l| {
            items.push((id, x, y, l.size, l.content_box_width(), l.padding, l.border))
        });
        for (id, x, y, size, content_w, padding, border) in items {
            let d = self.tree.get_node_context_mut(id).unwrap();
            if d.hidden {
                continue;
            }
            if let Some(bg) = d.background {
                fill_rect(s, x, y, size.width, size.height, bg);
            }
            if d.radius > 0.0 {
                if let Some((w, c)) = d.borders.top {
                    stroke_rrect(
                        s,
                        x + w / 2.0,
                        y + w / 2.0,
                        size.width - w,
                        size.height - w,
                        (d.radius - w / 2.0).min((size.height - w) / 2.0),
                        w,
                        c,
                    );
                }
            } else {
                let b = d.borders;
                if let Some((w, c)) = b.top {
                    fill_rect(s, x, y, size.width, w, c);
                }
                if let Some((w, c)) = b.bottom {
                    fill_rect(s, x, y + size.height - w, size.width, w, c);
                }
                if let Some((w, c)) = b.left {
                    fill_rect(s, x, y, w, size.height, c);
                }
                if let Some((w, c)) = b.right {
                    fill_rect(s, x + size.width - w, y, w, size.height, c);
                }
            }
            let cx = x + padding.left + border.left;
            let cy = y + padding.top + border.top;
            match &mut d.content {
                Content::None => {}
                Content::Text(t) => t.draw(fonts, s, cx, cy, content_w),
                Content::Svg(svg) => {
                    let (iw, ih) = svg.tree.size();
                    let h = size.height
                        - padding.top
                        - padding.bottom
                        - border.top
                        - border.bottom
                        - svg.inline_gap;
                    let scale = (content_w / iw).min(h / ih);
                    s.push_transform(&Transform::from_row(scale, 0.0, 0.0, scale, cx, cy));
                    let natural = krilla::geom::Size::from_wh(iw, ih).unwrap();
                    match &svg.tree {
                        Picture::Svg(tree) => {
                            // As a graphic, identical SVGs (seal, diagrams) are stored once per document.
                            let stream = {
                                let mut builder = s.stream_builder();
                                let mut gs = builder.surface();
                                gs.draw_svg(tree, natural, SvgSettings::default());
                                gs.finish();
                                builder.finish()
                            };
                            s.draw_graphic(krilla::graphic::Graphic::new(stream, false));
                        }
                        Picture::Raster(image) => s.draw_image(image.clone(), natural),
                    }
                    if let Some((ox, oy, t)) = &mut svg.overlay {
                        t.draw(fonts, s, *ox, *oy, iw - *ox);
                    }
                    s.pop();
                }
                Content::Qr(data) => draw_qr(s, cx, cy, content_w, data),
                Content::Table(t) => {
                    t.layout(fonts, AvailableSpace::Definite(content_w));
                    s.push_transform(&Transform::from_translate(cx, cy));
                    t.doc.paint(fonts, s, t.grid);
                    s.pop();
                }
            }
        }
    }
}

fn measure(
    fonts: &mut Fonts,
    known: Size<Option<f32>>,
    avail: Size<AvailableSpace>,
    ctx: Option<&mut NodeData>,
) -> Size<f32> {
    if let Size {
        width: Some(width),
        height: Some(height),
    } = known
    {
        return Size { width, height };
    }
    let Some(ctx) = ctx else { return Size::ZERO };
    match &mut ctx.content {
        Content::None => Size::ZERO,
        Content::Qr(_) => Size::ZERO,
        Content::Table(t) => {
            let avail_w = known.width.map_or(avail.width, AvailableSpace::Definite);
            let (w, h) = t.layout(fonts, avail_w);
            Size {
                width: known.width.unwrap_or(w),
                height: h,
            }
        }
        Content::Text(t) => {
            let max_w = known.width.or(match avail.width {
                AvailableSpace::Definite(w) => Some(w),
                AvailableSpace::MinContent => Some(0.0),
                AvailableSpace::MaxContent => None,
            });
            let (w, h) = t.measure(fonts, max_w);
            Size {
                width: known.width.unwrap_or(w),
                height: known.height.unwrap_or(h),
            }
        }
        Content::Svg(svg) => {
            let (iw, ih) = svg.tree.size();
            let ratio = ih / iw;
            match (known.width, known.height) {
                (Some(w), None) => Size {
                    width: w,
                    height: w * ratio + svg.inline_gap,
                },
                (None, Some(h)) => Size {
                    width: (h - svg.inline_gap) / ratio,
                    height: h,
                },
                _ => {
                    let w = match avail.width {
                        AvailableSpace::Definite(w) => w.min(iw),
                        _ => iw,
                    };
                    Size {
                        width: w,
                        height: w * ratio + svg.inline_gap,
                    }
                }
            }
        }
    }
}

pub fn fill_rect(s: &mut Surface, x: f32, y: f32, w: f32, h: f32, c: Color) {
    let Some(r) = KRect::from_xywh(x, y, w.max(0.0001), h.max(0.0001)) else {
        return;
    };
    let mut pb = PathBuilder::new();
    pb.push_rect(r);
    s.set_stroke(None);
    s.set_fill(Some(Fill {
        paint: rgb::Color::new(c.0, c.1, c.2).into(),
        ..Default::default()
    }));
    s.draw_path(&pb.finish().unwrap());
}

fn stroke_rrect(s: &mut Surface, x: f32, y: f32, w: f32, h: f32, r: f32, sw: f32, c: Color) {
    let k = 0.5523 * r;
    let mut pb = PathBuilder::new();
    pb.move_to(x + r, y);
    pb.line_to(x + w - r, y);
    pb.cubic_to(x + w - r + k, y, x + w, y + r - k, x + w, y + r);
    pb.line_to(x + w, y + h - r);
    pb.cubic_to(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h);
    pb.line_to(x + r, y + h);
    pb.cubic_to(x + r - k, y + h, x, y + h - r + k, x, y + h - r);
    pb.line_to(x, y + r);
    pb.cubic_to(x, y + r - k, x + r - k, y, x + r, y);
    pb.close();
    s.set_fill(None);
    s.set_stroke(Some(Stroke {
        width: sw,
        paint: rgb::Color::new(c.0, c.1, c.2).into(),
        ..Default::default()
    }));
    s.draw_path(&pb.finish().unwrap());
    s.set_stroke(None);
}

fn draw_qr(s: &mut Surface, x: f32, y: f32, size: f32, data: &str) {
    let code =
        qrcode::QrCode::with_error_correction_level(data.as_bytes(), qrcode::EcLevel::L).unwrap();
    let n = code.width();
    let colors = code.to_colors();
    // One rectangle per horizontal run of dark modules, in module units.
    let mut pb = PathBuilder::new();
    for row in 0..n {
        let mut col = 0;
        while col < n {
            if colors[row * n + col] != qrcode::Color::Dark {
                col += 1;
                continue;
            }
            let start = col;
            while col < n && colors[row * n + col] == qrcode::Color::Dark {
                col += 1;
            }
            pb.push_rect(
                KRect::from_xywh(start as f32, row as f32, (col - start) as f32, 1.0).unwrap(),
            );
        }
    }
    let Some(path) = pb.finish() else { return };
    let m = size / n as f32;
    s.push_transform(&Transform::from_row(m, 0.0, 0.0, m, x, y));
    s.set_stroke(None);
    s.set_fill(Some(Fill::default()));
    s.draw_path(&path);
    s.pop();
}

/// Fills the rects as a single reusable graphic, so identical sets (e.g. every page's timing marks) are stored once.
pub fn draw_shared_rects(s: &mut Surface, rects: &[(f32, f32, f32, f32)]) {
    let mut pb = PathBuilder::new();
    for &(x, y, w, h) in rects {
        pb.push_rect(KRect::from_xywh(x, y, w, h).unwrap());
    }
    let Some(path) = pb.finish() else { return };
    let stream = {
        let mut builder = s.stream_builder();
        let mut gs = builder.surface();
        gs.set_fill(Some(Fill::default()));
        gs.draw_path(&path);
        gs.finish();
        builder.finish()
    };
    s.draw_graphic(krilla::graphic::Graphic::new(stream, false));
}
