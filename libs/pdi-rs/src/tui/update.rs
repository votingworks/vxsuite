use std::time::Duration;

use anyhow::Result;
use crossterm::event::{self, Event::Key, KeyCode::Char};

use crate::pdiscan::{EjectDirection, Event};

use super::{
    app::App,
    config::{AutoScanConfig, WatchStatusConfig, EJECT_DELAY_STEP},
};

pub(crate) fn update(app: &mut App) -> Result<()> {
    if let Some(ref scanner) = app.get_scanner() {
        match scanner.wait_for_event(Duration::from_millis(1)) {
            Ok(Event::BeginScan) => {
                app.log("📄 Scanning document…");
            }
            Ok(Event::EndScan) => {
                app.log("📄 Finished scanning document.");
            }
            Ok(Event::AbortScan) => {
                app.log("⚠️ Scan aborted.");
            }
            Ok(Event::EjectPaused) => {
                app.log("📄 Eject paused.");
            }
            Ok(Event::EjectResumed) => {
                app.log("📄 Eject resumed.");
            }
            Ok(Event::FeederDisabled) => {
                app.log("⛔︎ Feeder disabled.");
            }
            Err(_) => {}
        }

        if let Ok(document) = scanner.wait_for_document(Duration::from_millis(1)) {
            let next_scan_index = app.increment_scan_index();
            let front_filename = format!("side-a-{:03}.jpeg", next_scan_index);
            let back_filename = format!("side-b-{:03}.jpeg", next_scan_index);

            if let Some(image) = document.front_side_image {
                match image.save(front_filename.clone()) {
                    Ok(_) => {
                        app.log(format!("✨ Saved front image as '{}'.", front_filename));
                    }
                    Err(e) => {
                        app.log(format!("⚠️ Error saving front image: {:?}", e));
                    }
                }
            }

            if let Some(image) = document.back_side_image {
                match image.save(back_filename.clone()) {
                    Ok(_) => {
                        app.log(format!("✨ Saved back image as '{}'.", back_filename));
                    }
                    Err(e) => {
                        app.log(format!("⚠️ Error saving back image: {:?}", e));
                    }
                }
            }
        }

        if let Ok(error) = scanner.wait_for_error(Duration::from_millis(1)) {
            app.log(format!(
                "⚠️ Scanner error: {} ({:?})",
                error.short_description, error.error_type
            ));
            app.log(format!("⚠️ Description: {}", error.long_description));
            if !error.extra_info.is_empty() {
                app.log(format!("⚠️ Additional information: {}", error.extra_info));
            }
        }
    }

    if event::poll(Duration::from_millis(50))? {
        if let Key(key) = event::read()? {
            match (
                key.code,
                app.get_scanner().as_ref(),
                app.get_auto_scan_config(),
                app.get_watch_status_config(),
            ) {
                (Char('c'), None, _, _) => app.connect(),
                (Char('d'), Some(_), _, _) => app.disconnect(),
                (Char('q'), _, _, _) => app.quit(),
                (Char('s'), Some(scanner), AutoScanConfig::Disabled, _) => {
                    scanner.set_feeder_enabled(true)?;
                    app.log("✨ Auto-scan enabled.");
                    app.set_auto_scan_config(AutoScanConfig::Enabled(Default::default()));
                }
                (Char('s'), Some(scanner), AutoScanConfig::Enabled(_), _) => {
                    scanner.set_feeder_enabled(false)?;
                    app.log("⛔︎ Auto-scan disabled.");
                    app.set_auto_scan_config(AutoScanConfig::Disabled);
                }
                (Char('S'), Some(scanner), _, _) => {
                    let status = scanner.get_scanner_status()?;
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
                    app.log(format!("High-speed mode: {}", status.high_speed_mode));
                    app.log(format!("Download needed: {}", status.download_needed));
                    app.log(format!(
                        "Scanner enabled: {}",
                        status.scanner_feeder_enabled
                    ));
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
                    app.log(format!("Document jam: {}", status.ticket_jam));
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
                (Char('w'), Some(_), _, WatchStatusConfig::Disabled) => {
                    app.log("👀 Watching scanner status.");
                    app.set_watch_status_config(WatchStatusConfig::Enabled);
                }
                (Char('w'), Some(_), _, WatchStatusConfig::Enabled) => {
                    app.log("👀 Stopped watching scanner status.");
                    app.set_watch_status_config(WatchStatusConfig::Disabled);
                }
                (Char('l'), Some(scanner), _, _) => {
                    scanner.load_document()?;
                    app.log("📄 Loaded document into scanner.");
                }
                (Char('f'), Some(scanner), AutoScanConfig::Enabled(_), _) => {
                    scanner.set_eject_direction(EjectDirection::FrontDrop);
                    app.log("📄 Will drop paper out front after scan.");
                }
                (Char('F'), Some(scanner), AutoScanConfig::Enabled(_), _) => {
                    scanner.set_eject_direction(EjectDirection::FrontHold);
                    app.log("📄 Will hold paper out front after scan.");
                }
                (Char('b'), Some(scanner), AutoScanConfig::Enabled(_), _) => {
                    scanner.set_eject_direction(EjectDirection::BackDrop);
                    app.log("📄 Will drop paper out back after scan.");
                }
                (Char('B'), Some(scanner), AutoScanConfig::Enabled(_), _) => {
                    scanner.set_eject_direction(EjectDirection::BackHold);
                    app.log("📄 Will hold paper out back after scan.");
                }
                (Char('a'), Some(scanner), _, _) => {
                    scanner.accept_document_back()?;
                    app.log("📄 Accepted & dropped sheet into scanner.");
                }
                (Char('r'), Some(scanner), _, _) => {
                    scanner.reject_and_hold_document_front()?;
                    app.log("📄 Rejected & held document out front.");
                }
                (Char('R'), Some(scanner), _, _) => {
                    scanner.reject_document_front()?;
                    app.log("📄 Rejected & dropped document out front.");
                }
                (Char('+' | '='), Some(scanner), AutoScanConfig::Enabled(_), _) => {
                    scanner.set_eject_delay(scanner.get_eject_delay() + EJECT_DELAY_STEP);
                    app.log(format!(
                        "📄 Eject delay increased to {:?}.",
                        scanner.get_eject_delay(),
                    ));
                }
                (Char('-'), Some(scanner), AutoScanConfig::Enabled(_), _) => {
                    scanner.set_eject_delay(
                        scanner.get_eject_delay().saturating_sub(EJECT_DELAY_STEP),
                    );
                    app.log(format!(
                        "📄 Eject delay decreased to {:?}.",
                        scanner.get_eject_delay(),
                    ));
                }
                (Char(c), _, _, _) => app.log(format!("⚠️ Unhandled key: '{}'.", c)),
                _ => (),
            }
        }
    }

    Ok(())
}
