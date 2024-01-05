use pdi_rs::protocol::types::EjectMotion;
use ratatui::{
    prelude::*,
    widgets::{self, block::Title},
};

use super::{
    app::{App, ConnectionState},
    config::{AutoScanConfig, WatchStatusConfig, EJECT_DELAY_STEP},
};

pub(crate) type Frame<'a> = ratatui::Frame<'a, CrosstermBackend<std::io::Stderr>>;

pub(crate) fn ui(app: &mut App, frame: &mut Frame<'_>) {
    let rects = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Percentage(50), Constraint::Percentage(50)].as_ref())
        .split(frame.size());
    let auto_scan_config = app.get_auto_scan_config();
    let watch_status_config = app.get_watch_status_config();
    frame.render_widget(
        widgets::Paragraph::new(Text::from(
            match (
                app.connection_state(),
                auto_scan_config,
                watch_status_config,
            ) {
                (ConnectionState::Connecting, _, _) => vec![],
                (ConnectionState::Disconnected, _, _) => {
                    vec![
                        Line::from(" "),
                        Line::from(Span::raw("  Commands:").bold()),
                        Line::from(vec![
                            Span::raw("  c").bold(),
                            Span::raw(" Connect to scanner"),
                        ]),
                        Line::from(vec![Span::raw("  q").bold(), Span::raw(" Quit")]),
                    ]
                }
                (ConnectionState::Connected, AutoScanConfig::Disabled, watch_status) => vec![
                    Line::from(" "),
                    Line::from(Span::raw("  Commands:").bold()),
                    Line::from(vec![
                        Span::raw("  s").bold(),
                        Span::raw(" Enable auto-scan"),
                    ]),
                    Line::from(vec![
                        Span::raw("  S").bold(),
                        Span::raw(" Log current scanner status once"),
                    ]),
                    Line::from(vec![
                        Span::raw("  w").bold(),
                        Span::raw(match watch_status {
                            WatchStatusConfig::Disabled => " Start watching scanner status",
                            WatchStatusConfig::Enabled => " Stop watching scanner status",
                        }),
                    ]),
                    // TODO: this function doesn't seem to work. why?
                    // Line::from(vec![
                    //     Span::raw("  l").bold(),
                    //     Span::raw(" Load document into scanner"),
                    // ]),
                    Line::from(vec![
                        Span::raw("  a").bold(),
                        Span::raw(" Accept document into scanner"),
                    ]),
                    Line::from(vec![
                        Span::raw("  r").bold(),
                        Span::raw(" Reject document and hold out front"),
                    ]),
                    Line::from(vec![
                        Span::raw("  R").bold(),
                        Span::raw(" Reject document and drop out front"),
                    ]),
                    Line::from(vec![
                        Span::raw("  d").bold(),
                        Span::raw(" Disconnect from scanner"),
                    ]),
                    Line::from(vec![Span::raw("  q").bold(), Span::raw(" Quit")]),
                ],
                (
                    ConnectionState::Connected,
                    AutoScanConfig::Enabled(eject_motion),
                    watch_status,
                ) => {
                    vec![
                        Line::from(" "),
                        Line::from(Span::raw("  Auto-Scan Eject Setting:").bold()),
                        Line::from(vec![
                            Span::raw("  b").bold(),
                            Span::raw(format!(
                                " {} Drop paper in back after scan",
                                if let Some(EjectMotion::ToRear) = eject_motion {
                                    "☑️"
                                } else {
                                    "☐"
                                }
                            )),
                        ]),
                        Line::from(vec![
                            Span::raw("  B").bold(),
                            Span::raw(format!(
                                " {} Hold paper in back after scan",
                                if eject_motion.is_none() {
                                    "☑️"
                                } else {
                                    "☐"
                                }
                            )),
                        ]),
                        Line::from(vec![
                            Span::raw("  f").bold(),
                            Span::raw(format!(
                                " {} Drop paper in front after scan",
                                if let Some(EjectMotion::ToFront) = eject_motion {
                                    "☑️"
                                } else {
                                    "☐"
                                }
                            )),
                        ]),
                        Line::from(vec![
                            Span::raw("  F").bold(),
                            Span::raw(format!(
                                " {} Hold paper in front after scan",
                                if let Some(EjectMotion::ToFrontAndHold) = eject_motion {
                                    "☑️"
                                } else {
                                    "☐"
                                }
                            )),
                        ]),
                        Line::from(vec![
                            Span::raw("  +").bold(),
                            Span::raw(format!(
                                " Increase eject delay by {:?} to {:?}",
                                EJECT_DELAY_STEP,
                                app.auto_eject_delay() + EJECT_DELAY_STEP
                            )),
                        ]),
                        Line::from(vec![
                            Span::raw("  -").bold(),
                            Span::raw(format!(
                                " Decrease eject delay by {:?} to {:?}",
                                EJECT_DELAY_STEP,
                                app.auto_eject_delay().saturating_sub(EJECT_DELAY_STEP)
                            )),
                        ]),
                        Line::from(" "),
                        Line::from(Span::raw("  Commands:").bold()),
                        Line::from(vec![
                            Span::raw("  s").bold(),
                            Span::raw(" Disable auto-scan"),
                        ]),
                        Line::from(vec![
                            Span::raw("  S").bold(),
                            Span::raw(" Log current scanner status once"),
                        ]),
                        Line::from(vec![
                            Span::raw("  w").bold(),
                            Span::raw(match watch_status {
                                WatchStatusConfig::Disabled => " Start watching scanner status",
                                WatchStatusConfig::Enabled => " Stop watching scanner status",
                            }),
                        ]),
                        Line::from(vec![
                            Span::raw("  a").bold(),
                            Span::raw(" Accept document into scanner"),
                        ]),
                        Line::from(vec![
                            Span::raw("  r").bold(),
                            Span::raw(" Reject document and hold out front"),
                        ]),
                        Line::from(vec![
                            Span::raw("  R").bold(),
                            Span::raw(" Reject document and drop out front"),
                        ]),
                        Line::from(vec![
                            Span::raw("  d").bold(),
                            Span::raw(" Disconnect from scanner"),
                        ]),
                        Line::from(vec![Span::raw("  q").bold(), Span::raw(" Quit")]),
                    ]
                }
            },
        ))
        .block(
            widgets::Block::default()
                .title(Title::default().content(Line::from(vec![
                    Span::raw(" PDI Scanner "),
                    match app.connection_state() {
                        ConnectionState::Connecting => {
                            Span::raw("(⏳ connecting)").fg(Color::LightYellow)
                        }
                        ConnectionState::Disconnected => {
                            Span::raw("(🔌 disconnected)").fg(Color::LightRed)
                        }
                        ConnectionState::Connected => Span::raw("(⚡ connected)").fg(Color::Green),
                    },
                    Span::raw(" "),
                ])))
                .borders(widgets::Borders::ALL)
                .border_style(Style::default().fg(match app.connection_state() {
                    ConnectionState::Connecting => Color::LightYellow,
                    ConnectionState::Disconnected => Color::LightRed,
                    ConnectionState::Connected => Color::Green,
                })),
        ),
        rects[0],
    );

    let log_entries = app.log_entries(rects[1].height as usize);
    frame.render_widget(
        widgets::Paragraph::new(Text::from(
            log_entries
                .iter()
                .map(|entry| entry.line())
                .collect::<Vec<_>>(),
        ))
        .block(
            widgets::Block::default()
                .title(" Log ")
                .borders(widgets::Borders::ALL)
                .border_style(Style::default().fg(Color::Gray)),
        ),
        rects[1],
    );
}
