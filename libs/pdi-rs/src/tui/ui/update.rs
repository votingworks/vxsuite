use std::{sync::mpsc::RecvTimeoutError, thread, time::Duration};

use anyhow::Result;
use crossterm::event::{self, Event::Key, KeyCode::Char, KeyModifiers};
use pdi_rs::pdiscan::protocol::{types::EjectMotion, Event};

use super::{
    app::{App, ConnectionState},
    config::{AutoScanConfig, WatchStatusConfig},
};

pub(crate) fn update(app: &mut App) -> Result<()> {
    match app.await_event(Duration::from_millis(10)) {
        Ok(Event::BeginScan) => {
            app.log("📄 Scanning document…");
        }
        Ok(Event::EndScan) => {
            app.log("📄 Finished scanning document.");
            if let AutoScanConfig::Enabled(Some(eject_motion)) = app.get_auto_scan_config() {
                thread::sleep(app.auto_eject_delay());
                app.eject_document(eject_motion)?;
            }
        }
        Ok(event) => {
            app.log(format!("⚠️ Unknown event: {event:?}"));
        }
        Err(_) => {}
    }

    if event::poll(Duration::from_millis(50))? {
        if let Key(key) = event::read()? {
            let auto_scan_config = app.get_auto_scan_config();
            let watch_status_config = app.get_watch_status_config();

            match (
                key.modifiers,
                key.code,
                app.connection_state(),
                auto_scan_config,
                watch_status_config,
            ) {
                (KeyModifiers::NONE, Char('c'), ConnectionState::Disconnected, _, _) => {
                    app.connect()
                }
                (KeyModifiers::NONE, Char('d'), ConnectionState::Connected, _, _) => {
                    app.disconnect()
                }
                (KeyModifiers::NONE, Char('q'), _, _, _) => app.quit(),
                (
                    KeyModifiers::NONE,
                    Char('s'),
                    ConnectionState::Connected,
                    AutoScanConfig::Disabled,
                    _,
                ) => {
                    app.set_feeder_enabled(true);
                    app.log("✨ Auto-scan enabled.");
                    app.set_auto_scan_config(AutoScanConfig::Enabled(Some(EjectMotion::ToRear)));
                }
                (
                    KeyModifiers::NONE,
                    Char('s'),
                    ConnectionState::Connected,
                    AutoScanConfig::Enabled(_),
                    _,
                ) => {
                    app.set_feeder_enabled(false);
                    app.log("⛔︎ Auto-scan disabled.");
                    app.set_auto_scan_config(AutoScanConfig::Disabled);
                }
                (KeyModifiers::NONE, Char('S'), ConnectionState::Connected, _, _) => {
                    let status = app.get_scanner_status().unwrap();
                    app.log("📄 Scanner status:");
                    app.log(format!(
                        "Rear left sensor covered: {}",
                        status.rear_left_sensor_covered
                    ));
                    app.log(format!(
                        "Rear right sensor covered: {}",
                        status.rear_right_sensor_covered
                    ));
                    app.log(format!(
                        "Brander position sensor covered: {}",
                        status.brander_position_sensor_covered
                    ));
                    // app.log(format!("High-speed mode: {}", status.high_speed_mode));
                    app.log(format!("Download needed: {}", status.download_needed));
                    app.log(format!("Scanner enabled: {}", status.scanner_enabled));
                    app.log(format!(
                        "Front left sensor covered: {}",
                        status.front_left_sensor_covered
                    ));
                    app.log(format!(
                        "Front M1 sensor covered: {}",
                        status.front_m1_sensor_covered
                    ));
                    app.log(format!(
                        "Front M2 sensor covered: {}",
                        status.front_m2_sensor_covered
                    ));
                    app.log(format!(
                        "Front M3 sensor covered: {}",
                        status.front_m3_sensor_covered
                    ));
                    app.log(format!(
                        "Front M4 sensor covered: {}",
                        status.front_m4_sensor_covered
                    ));
                    app.log(format!(
                        "Front M5 sensor covered: {}",
                        status.front_m5_sensor_covered
                    ));
                    app.log(format!(
                        "Front right sensor covered: {}",
                        status.front_right_sensor_covered
                    ));
                    app.log(format!("Scanner ready: {}", status.scanner_ready));
                    app.log(format!("XMT aborted (com error): {}", status.xmt_aborted));
                    app.log(format!("Document jam: {}", status.document_jam));
                    app.log(format!(
                        "Scan array pixel error: {}",
                        status.scan_array_pixel_error
                    ));
                    app.log(format!("In diagnostic mode: {}", status.in_diagnostic_mode));
                    app.log(format!(
                        "Document in scanner: {}",
                        status.document_in_scanner
                    ));
                    app.log(format!(
                        "Calibration of unit needed: {}",
                        status.calibration_of_unit_needed
                    ));
                }
                (
                    KeyModifiers::NONE,
                    Char('w'),
                    ConnectionState::Connected,
                    _,
                    WatchStatusConfig::Disabled,
                ) => {
                    app.log("👀 Watching scanner status.");
                    app.set_watch_status_config(WatchStatusConfig::Enabled);
                }
                (
                    KeyModifiers::NONE,
                    Char('w'),
                    ConnectionState::Connected,
                    _,
                    WatchStatusConfig::Enabled,
                ) => {
                    app.log("👀 Stopped watching scanner status.");
                    app.set_watch_status_config(WatchStatusConfig::Disabled);
                }
                // (KeyModifiers::NONE, Char('l'), Some(scanner), _, _) => {
                //     scanner.load_document()?;
                //     app.log("📄 Loaded document into scanner.");
                // }
                (KeyModifiers::NONE, Char('f'), _, AutoScanConfig::Enabled(_), _) => {
                    app.set_auto_scan_config(AutoScanConfig::Enabled(Some(EjectMotion::ToFront)));
                    app.log("📄 Will drop paper out front after scan.");
                }
                (KeyModifiers::NONE, Char('F'), _, AutoScanConfig::Enabled(_), _) => {
                    app.set_auto_scan_config(AutoScanConfig::Enabled(Some(
                        EjectMotion::ToFrontAndHold,
                    )));
                    app.log("📄 Will hold paper out front after scan.");
                }
                (KeyModifiers::NONE, Char('b'), _, AutoScanConfig::Enabled(_), _) => {
                    app.set_auto_scan_config(AutoScanConfig::Enabled(Some(EjectMotion::ToRear)));
                    app.log("📄 Will drop paper out back after scan.");
                }
                (
                    KeyModifiers::NONE,
                    Char('B'),
                    ConnectionState::Connected,
                    AutoScanConfig::Enabled(_),
                    _,
                ) => {
                    app.set_auto_scan_config(AutoScanConfig::Enabled(None));
                    app.log("📄 Will hold paper out back after scan.");
                }
                (KeyModifiers::NONE, Char('a'), ConnectionState::Connected, _, _) => {
                    app.eject_document(EjectMotion::ToRear)?;
                    app.log("📄 Accepted & dropped sheet into scanner.");
                }
                (KeyModifiers::NONE, Char('r'), ConnectionState::Connected, _, _) => {
                    app.eject_document(EjectMotion::ToFrontAndHold)?;
                    app.log("📄 Rejected & held document out front.");
                }
                (KeyModifiers::NONE, Char('R'), ConnectionState::Connected, _, _) => {
                    app.eject_document(EjectMotion::ToFront)?;
                    app.log("📄 Rejected & dropped document out front.");
                }
                (
                    KeyModifiers::NONE | KeyModifiers::SHIFT,
                    Char('+' | '='),
                    _,
                    AutoScanConfig::Enabled(_),
                    _,
                ) => {
                    app.increment_auto_eject_delay();
                    app.log(format!(
                        "📄 Eject delay increased to {:?}.",
                        app.auto_eject_delay(),
                    ));
                }
                (KeyModifiers::NONE, Char('-'), _, AutoScanConfig::Enabled(_), _) => {
                    app.decrement_auto_eject_delay();
                    app.log(format!(
                        "📄 Eject delay decreased to {:?}.",
                        app.auto_eject_delay(),
                    ));
                }
                (KeyModifiers::NONE, Char('C'), _, _, _) => {
                    app.navigate_to_calibration_menu();
                }
                (KeyModifiers::NONE, Char(c), _, _, _) => {
                    app.log(format!("⚠️ Unhandled key: '{c}'."))
                }
                (KeyModifiers::CONTROL, Char('l'), _, _, _) => {
                    app.clear_log();
                }
                _ => (),
            }
        }
    }

    Ok(())
}
