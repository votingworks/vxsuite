use std::{thread, time::Duration};

use anyhow::Result;
use crossterm::event::{self, Event::Key, KeyCode::Char};
use pdi_rs::pdiscan::protocol::types::EjectMotion;

use super::{
    app::App,
    config::{AutoScanConfig, WatchStatusConfig},
};

pub(crate) fn update(app: &mut App) -> Result<()> {
    if app.wait_for_scan_begin(Duration::from_millis(10)).is_ok() {
        app.log("📄 Scanning document…");
    }

    if app.wait_for_scan_end(Duration::from_millis(10)).is_ok() {
        app.log("📄 Finished scanning document.");
        if let AutoScanConfig::Enabled(Some(eject_motion)) = app.get_auto_scan_config() {
            thread::sleep(app.auto_eject_delay());
            app.eject_document(eject_motion)?;
        }
    }

    if let Some(client) = app.get_client() {
        // match client.await_event(Instant::now() + Duration::from_millis(1)) {
        //     Ok(Event::BeginScan) => {
        //         app.log("📄 Scanning document…");
        //     }
        //     Ok(Event::EndScan) => {
        //         app.log("📄 Finished scanning document.");
        //     }
        //     Ok(Event::AbortScan) => {
        //         app.log("⚠️ Scan aborted.");
        //     }
        //     Ok(Event::EjectPaused) => {
        //         app.log("📄 Eject paused.");
        //     }
        //     Ok(Event::EjectResumed) => {
        //         app.log("📄 Eject resumed.");
        //     }
        //     Ok(Event::FeederDisabled) => {
        //         app.log("⛔︎ Feeder disabled.");
        //     }
        //     Err(_) => {}
        // }

        // if let Ok(document) = client.wait_for_document(Duration::from_millis(1)) {
        //     let next_scan_index = app.increment_scan_index();
        //     let front_filename = format!("side-a-{:03}.jpeg", next_scan_index);
        //     let back_filename = format!("side-b-{:03}.jpeg", next_scan_index);

        //     if let Some(image) = document.front_side_image {
        //         match image.save(front_filename.clone()) {
        //             Ok(_) => {
        //                 app.log(format!("✨ Saved front image as '{}'.", front_filename));
        //             }
        //             Err(e) => {
        //                 app.log(format!("⚠️ Error saving front image: {:?}", e));
        //             }
        //         }
        //     }

        //     if let Some(image) = document.back_side_image {
        //         match image.save(back_filename.clone()) {
        //             Ok(_) => {
        //                 app.log(format!("✨ Saved back image as '{}'.", back_filename));
        //             }
        //             Err(e) => {
        //                 app.log(format!("⚠️ Error saving back image: {:?}", e));
        //             }
        //         }
        //     }
        // }

        // if let Ok(error) = client.wait_for_error(Duration::from_millis(1)) {
        //     app.log(format!(
        //         "⚠️ Scanner error: {} ({:?})",
        //         error.short_description, error.error_type
        //     ));
        //     app.log(format!("⚠️ Description: {}", error.long_description));
        //     if !error.extra_info.is_empty() {
        //         app.log(format!("⚠️ Additional information: {}", error.extra_info));
        //     }
        // }
    }

    if event::poll(Duration::from_millis(50))? {
        if let Key(key) = event::read()? {
            let auto_scan_config = app.get_auto_scan_config();
            let watch_status_config = app.get_watch_status_config();

            match (
                key.code,
                app.get_client(),
                auto_scan_config,
                watch_status_config,
            ) {
                (Char('c'), None, _, _) => app.connect(),
                (Char('d'), Some(_), _, _) => app.disconnect(),
                (Char('q'), _, _, _) => app.quit(),
                (Char('s'), Some(client), AutoScanConfig::Disabled, _) => {
                    client.set_feeder_enabled(true);
                    app.log("✨ Auto-scan enabled.");
                    app.set_auto_scan_config(AutoScanConfig::Enabled(Some(EjectMotion::ToRear)));
                }
                (Char('s'), Some(client), AutoScanConfig::Enabled(_), _) => {
                    client.set_feeder_enabled(false);
                    app.log("⛔︎ Auto-scan disabled.");
                    app.set_auto_scan_config(AutoScanConfig::Disabled);
                }
                (Char('S'), Some(client), _, _) => {
                    let status = client.get_scanner_status(None)?;
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
                (Char('w'), Some(_), _, WatchStatusConfig::Disabled) => {
                    app.log("👀 Watching scanner status.");
                    app.set_watch_status_config(WatchStatusConfig::Enabled);
                }
                (Char('w'), Some(_), _, WatchStatusConfig::Enabled) => {
                    app.log("👀 Stopped watching scanner status.");
                    app.set_watch_status_config(WatchStatusConfig::Disabled);
                }
                // (Char('l'), Some(scanner), _, _) => {
                //     scanner.load_document()?;
                //     app.log("📄 Loaded document into scanner.");
                // }
                (Char('f'), _, AutoScanConfig::Enabled(_), _) => {
                    app.set_auto_scan_config(AutoScanConfig::Enabled(Some(EjectMotion::ToFront)));
                    app.log("📄 Will drop paper out front after scan.");
                }
                (Char('F'), _, AutoScanConfig::Enabled(_), _) => {
                    app.set_auto_scan_config(AutoScanConfig::Enabled(Some(
                        EjectMotion::ToFrontAndHold,
                    )));
                    app.log("📄 Will hold paper out front after scan.");
                }
                (Char('b'), _, AutoScanConfig::Enabled(_), _) => {
                    app.set_auto_scan_config(AutoScanConfig::Enabled(Some(EjectMotion::ToRear)));
                    app.log("📄 Will drop paper out back after scan.");
                }
                (Char('B'), Some(_), AutoScanConfig::Enabled(_), _) => {
                    app.set_auto_scan_config(AutoScanConfig::Enabled(None));
                    app.log("📄 Will hold paper out back after scan.");
                }
                (Char('a'), Some(_), _, _) => {
                    app.eject_document(EjectMotion::ToRear)?;
                    app.log("📄 Accepted & dropped sheet into scanner.");
                }
                (Char('r'), Some(_), _, _) => {
                    app.eject_document(EjectMotion::ToFrontAndHold)?;
                    app.log("📄 Rejected & held document out front.");
                }
                (Char('R'), Some(_), _, _) => {
                    app.eject_document(EjectMotion::ToFront)?;
                    app.log("📄 Rejected & dropped document out front.");
                }
                (Char('+' | '='), _, AutoScanConfig::Enabled(_), _) => {
                    app.increment_auto_eject_delay();
                    app.log(format!(
                        "📄 Eject delay increased to {:?}.",
                        app.auto_eject_delay(),
                    ));
                }
                (Char('-'), _, AutoScanConfig::Enabled(_), _) => {
                    app.decrement_auto_eject_delay();
                    app.log(format!(
                        "📄 Eject delay decreased to {:?}.",
                        app.auto_eject_delay(),
                    ));
                }
                (Char(c), _, _, _) => app.log(format!("⚠️ Unhandled key: '{c}'.")),
                _ => (),
            }
        }
    }

    Ok(())
}
