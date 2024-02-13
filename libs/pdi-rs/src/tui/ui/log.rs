use ratatui::{
    style::{Color, Stylize},
    text::{Line, Span},
};

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LogEntry<'a> {
    line: Line<'a>,
    count: u32,
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
            count: 1,
        }
    }

    pub fn count(&self) -> u32 {
        self.count
    }

    pub fn increment_count(&mut self) {
        self.count += 1;
    }

    pub fn line(&self) -> Line<'a> {
        if self.count > 1 {
            let mut spans = self.line.spans.clone();
            spans.push(Span::raw(format!(" ({}x)", self.count)).fg(Color::LightBlue));
            Line::from(spans)
        } else {
            self.line.clone()
        }
    }
}

impl PartialEq<&LogEntry<'_>> for LogEntry<'_> {
    fn eq(&self, other: &&LogEntry<'_>) -> bool {
        self.line == other.line
    }
}

impl PartialEq<&mut LogEntry<'_>> for LogEntry<'_> {
    fn eq(&self, other: &&mut LogEntry<'_>) -> bool {
        self.line == other.line
    }
}

impl PartialEq<LogEntry<'_>> for &LogEntry<'_> {
    fn eq(&self, other: &LogEntry<'_>) -> bool {
        self.line == other.line
    }
}

impl PartialEq<LogEntry<'_>> for &mut LogEntry<'_> {
    fn eq(&self, other: &LogEntry<'_>) -> bool {
        self.line == other.line
    }
}
