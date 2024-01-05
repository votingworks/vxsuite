use ratatui::{
    style::{Color, Stylize},
    text::{Line, Span},
};

#[derive(Clone)]
pub(crate) struct LogEntry<'a> {
    pub line: Line<'a>,
}

impl<'a> LogEntry<'a> {
    pub fn new(line: impl Into<Line<'a>>) -> Self {
        let timestamp = chrono::Local::now();
        let mut spans = vec![
            Span::raw(timestamp.format("%H:%M:%S").to_string()).fg(Color::LightBlue),
            Span::raw(" "),
        ];
        spans.extend(line.into().spans);
        Self {
            line: Line::from(spans),
        }
    }
}
