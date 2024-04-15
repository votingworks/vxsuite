use anyhow::Result;
use ratatui::{prelude::CrosstermBackend, Terminal};

use pdi_scanner::connect;

use crate::{
    app::{App, ConnectionState},
    config::WatchStatusConfig,
    ui::ui,
    update::update,
};

pub(crate) fn run() -> Result<()> {
    // ratatui terminal
    let mut t = Terminal::new(CrosstermBackend::new(std::io::stderr()))?;

    // application state
    let mut app = App::new();
    app.log("Application started");

    let mut last_status = None;

    loop {
        // application update
        update(&mut app)?;

        // application render
        t.draw(|f| {
            ui(&mut app, f);
        })?;

        // application exit
        if app.should_quit() {
            app.quit();
            break;
        }

        if app.should_connect() {
            match connect() {
                Ok(client) => {
                    app.log("⚡ Connected to scanner.");
                    match app.on_connect(client) {
                        Ok(_) => {
                            app.set_should_connect(false);
                            assert_eq!(app.connection_state(), ConnectionState::Connected);
                        }
                        Err(e) => {
                            app.log(format!("❌ Error connecting to scanner: {e}."));
                        }
                    }
                }
                Err(e) => {
                    app.log(format!("❌ Error connecting to scanner: {e}."));
                }
            }

            last_status = app.get_scanner_status();
        }

        if app.should_disconnect() {
            if app.disconnect_client() {
                assert_eq!(app.connection_state(), ConnectionState::Disconnected);
                // let the client drop
                app.log("🔌 Disconnected from scanner.");
            }
            app.set_should_disconnect(false);
        }

        if let WatchStatusConfig::Enabled = app.get_watch_status_config() {
            if let Some(ref prev_status) = last_status {
                if let Some(current_status) = app.get_scanner_status() {
                    if current_status.brander_position_sensor_covered
                        != prev_status.brander_position_sensor_covered
                    {
                        app.log(format!(
                            "👀 Brander position sensor covered: {:?} → {:?}",
                            prev_status.brander_position_sensor_covered,
                            current_status.brander_position_sensor_covered
                        ));
                    }

                    if current_status.calibration_of_unit_needed
                        != prev_status.calibration_of_unit_needed
                    {
                        app.log(format!(
                            "👀 Calibration of unit needed: {:?} → {:?}",
                            prev_status.calibration_of_unit_needed,
                            current_status.calibration_of_unit_needed
                        ));
                    }

                    // if current_status.cover_open != prev_status.cover_open {
                    //     app.log(format!(
                    //         "👀 Cover open: {:?} → {:?}",
                    //         prev_status.cover_open, current_status.cover_open
                    //     ));
                    // }

                    if current_status.document_in_scanner != prev_status.document_in_scanner {
                        app.log(format!(
                            "👀 Document in scanner: {:?} → {:?}",
                            prev_status.document_in_scanner, current_status.document_in_scanner
                        ));
                    }

                    if current_status.download_needed != prev_status.download_needed {
                        app.log(format!(
                            "👀 Download needed: {:?} → {:?}",
                            prev_status.download_needed, current_status.download_needed
                        ));
                    }

                    if current_status.front_left_sensor_covered
                        != prev_status.front_left_sensor_covered
                    {
                        app.log(format!(
                            "👀 Front left sensor covered: {:?} → {:?}",
                            prev_status.front_left_sensor_covered,
                            current_status.front_left_sensor_covered
                        ));
                    }

                    if current_status.front_m1_sensor_covered != prev_status.front_m1_sensor_covered
                    {
                        app.log(format!(
                            "👀 Front M1 sensor covered: {:?} → {:?}",
                            prev_status.front_m1_sensor_covered,
                            current_status.front_m1_sensor_covered
                        ));
                    }

                    if current_status.front_m2_sensor_covered != prev_status.front_m2_sensor_covered
                    {
                        app.log(format!(
                            "👀 Front M2 sensor covered: {:?} → {:?}",
                            prev_status.front_m2_sensor_covered,
                            current_status.front_m2_sensor_covered
                        ));
                    }

                    if current_status.front_m3_sensor_covered != prev_status.front_m3_sensor_covered
                    {
                        app.log(format!(
                            "👀 Front M3 sensor covered: {:?} → {:?}",
                            prev_status.front_m3_sensor_covered,
                            current_status.front_m3_sensor_covered
                        ));
                    }

                    if current_status.front_m4_sensor_covered != prev_status.front_m4_sensor_covered
                    {
                        app.log(format!(
                            "👀 Front M4 sensor covered: {:?} → {:?}",
                            prev_status.front_m4_sensor_covered,
                            current_status.front_m4_sensor_covered
                        ));
                    }

                    if current_status.front_m5_sensor_covered != prev_status.front_m5_sensor_covered
                    {
                        app.log(format!(
                            "👀 Front M5 sensor covered: {:?} → {:?}",
                            prev_status.front_m5_sensor_covered,
                            current_status.front_m5_sensor_covered
                        ));
                    }

                    if current_status.front_right_sensor_covered
                        != prev_status.front_right_sensor_covered
                    {
                        app.log(format!(
                            "👀 Front right sensor covered: {:?} → {:?}",
                            prev_status.front_right_sensor_covered,
                            current_status.front_right_sensor_covered
                        ));
                    }

                    // if current_status.high_speed_mode != prev_status.high_speed_mode {
                    //     app.log(format!(
                    //         "👀 High speed mode: {:?} → {:?}",
                    //         prev_status.high_speed_mode, current_status.high_speed_mode
                    //     ));
                    // }

                    if current_status.in_diagnostic_mode != prev_status.in_diagnostic_mode {
                        app.log(format!(
                            "👀 In diagnostic mode: {:?} → {:?}",
                            prev_status.in_diagnostic_mode, current_status.in_diagnostic_mode
                        ));
                    }

                    if current_status.rear_left_sensor_covered
                        != prev_status.rear_left_sensor_covered
                    {
                        app.log(format!(
                            "👀 Rear left sensor covered: {:?} → {:?}",
                            prev_status.rear_left_sensor_covered,
                            current_status.rear_left_sensor_covered
                        ));
                    }

                    if current_status.rear_right_sensor_covered
                        != prev_status.rear_right_sensor_covered
                    {
                        app.log(format!(
                            "👀 Rear right sensor covered: {:?} → {:?}",
                            prev_status.rear_right_sensor_covered,
                            current_status.rear_right_sensor_covered
                        ));
                    }

                    if current_status.scan_array_pixel_error != prev_status.scan_array_pixel_error {
                        app.log(format!(
                            "👀 Scan array pixel error: {:?} → {:?}",
                            prev_status.scan_array_pixel_error,
                            current_status.scan_array_pixel_error
                        ));
                    }

                    if current_status.scanner_enabled != prev_status.scanner_enabled {
                        app.log(format!(
                            "👀 Scanner feeder enabled: {:?} → {:?}",
                            prev_status.scanner_enabled, current_status.scanner_enabled
                        ));
                    }

                    if current_status.scanner_ready != prev_status.scanner_ready {
                        app.log(format!(
                            "👀 Scanner ready: {:?} → {:?}",
                            prev_status.scanner_ready, current_status.scanner_ready
                        ));
                    }

                    if current_status.document_jam != prev_status.document_jam {
                        app.log(format!(
                            "👀 Document jam: {:?} → {:?}",
                            prev_status.document_jam, current_status.document_jam
                        ));
                    }

                    if current_status.xmt_aborted != prev_status.xmt_aborted {
                        app.log(format!(
                            "👀 XMT aborted: {:?} → {:?}",
                            prev_status.xmt_aborted, current_status.xmt_aborted
                        ));
                    }

                    last_status = Some(current_status);
                }
            }
        }
    }

    Ok(())
}
