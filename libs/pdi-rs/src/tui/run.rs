use std::os::unix::prelude::MetadataExt;

use anyhow::Result;
use ratatui::{
    prelude::CrosstermBackend,
    style::{Color, Stylize},
    text::{Line, Span},
    Terminal,
};

use crate::pdiscan::{kext, ColorDepth, DuplexMode, Scanner};

use super::{app::App, config::WatchStatusConfig, ui::ui, update::update};

pub(crate) fn run() -> Result<()> {
    // ratatui terminal
    let mut t = Terminal::new(CrosstermBackend::new(std::io::stderr()))?;

    // application state
    let mut app = App::new();
    app.log("Application started");

    if kext::is_installed() {
        app.log("🔌 Scanner kernel extension is installed.");

        if kext::is_device_ready() {
            app.log(
                "🔌 Scanner kernel extension device is present and has read/write permissions.",
            );
        } else {
            if let Ok(stat) = std::fs::metadata(kext::DEVICE_PATH) {
                app.log(format!("stat: {:?}", stat));
                app.log(format!("stat.file_type(): {:?}", stat.file_type()));
                app.log(format!("stat.uid(): {:?}", stat.uid()));
                app.log(format!("stat.mode(): {:#o}", stat.mode()));
                app.log(format!("stat.gid(): {:#o}", stat.gid()));
            }

            app.log(Span::raw(
                    "❌ Scanner kernel extension device is not present or does not have read/write permissions.",
                ));
            app.log("You will need to update the permissions using this command:");
            app.log("");
            app.log(Span::raw(format!("  sudo chmod a+rw {}", kext::DEVICE_PATH)).bold());
        }
    } else {
        app.log(
            Span::raw("❌ Scanner kernel extension is not installed.")
                .fg(Color::LightRed)
                .bold(),
        );
        app.log("You will need to install the kernel extension to use this application.");
        app.log("Run the following command to install the kernel extension:");
        app.log("");
        app.log(Span::raw("  sudo /sbin/insmod /path/to/pdi_ps3_drv_scanner.ko").bold());
        app.log("");
        app.log(Line::from(vec![
            Span::raw("Be sure to replace "),
            Span::raw("/path/to/pdi_ps3_drv_scanner.ko").underlined(),
        ]));
        app.log(Span::raw("with the actual path to the kernel extension."));
    }

    let mut last_status = None;

    loop {
        // application update
        update(&mut app)?;

        // application render
        t.draw(|f| {
            ui(&app, f);
        })?;

        // application exit
        if app.should_quit() {
            break;
        }

        if app.should_connect() {
            let scanner = match Scanner::connect(Default::default()) {
                Ok(scanner) => {
                    app.log("⚡ Connected to scanner.");
                    Some(scanner)
                }
                Err(e) => {
                    app.log(format!("❌ Error connecting to scanner: {e}."));
                    None
                }
            };
            app.set_scanner(scanner);
            if let Some(ref scanner) = app.get_scanner() {
                scanner.set_resolution(200)?;
                scanner.set_color_depth(ColorDepth::Bitonal)?;
                scanner.set_duplex_mode(DuplexMode::Duplex)?; // or DuplexMode::Simplex

                let status = scanner.get_scanner_status()?;

                if status.rear_left_sensor_covered {
                    scanner.reject_and_hold_document_front()?;
                }

                last_status = Some(status);
            }
            app.set_should_connect(false);
        }

        if app.should_disconnect() {
            if let Some(scanner) = app.get_scanner().take() {
                scanner.disconnect().unwrap();
                app.log("🔌 Disconnected from scanner.");
            }
            app.set_should_disconnect(false);
        }

        if let WatchStatusConfig::Enabled = app.get_watch_status_config() {
            if let Some(ref scanner) = app.get_scanner() {
                if let Some(ref prev_status) = last_status {
                    if let Ok(current_status) = scanner.get_scanner_status() {
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

                        if current_status.cover_open != prev_status.cover_open {
                            app.log(format!(
                                "👀 Cover open: {:?} → {:?}",
                                prev_status.cover_open, current_status.cover_open
                            ));
                        }

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

                        if current_status.front_m1_sensor_covered
                            != prev_status.front_m1_sensor_covered
                        {
                            app.log(format!(
                                "👀 Front M1 sensor covered: {:?} → {:?}",
                                prev_status.front_m1_sensor_covered,
                                current_status.front_m1_sensor_covered
                            ));
                        }

                        if current_status.front_m2_sensor_covered
                            != prev_status.front_m2_sensor_covered
                        {
                            app.log(format!(
                                "👀 Front M2 sensor covered: {:?} → {:?}",
                                prev_status.front_m2_sensor_covered,
                                current_status.front_m2_sensor_covered
                            ));
                        }

                        if current_status.front_m3_sensor_covered
                            != prev_status.front_m3_sensor_covered
                        {
                            app.log(format!(
                                "👀 Front M3 sensor covered: {:?} → {:?}",
                                prev_status.front_m3_sensor_covered,
                                current_status.front_m3_sensor_covered
                            ));
                        }

                        if current_status.front_m4_sensor_covered
                            != prev_status.front_m4_sensor_covered
                        {
                            app.log(format!(
                                "👀 Front M4 sensor covered: {:?} → {:?}",
                                prev_status.front_m4_sensor_covered,
                                current_status.front_m4_sensor_covered
                            ));
                        }

                        if current_status.front_m5_sensor_covered
                            != prev_status.front_m5_sensor_covered
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

                        if current_status.high_speed_mode != prev_status.high_speed_mode {
                            app.log(format!(
                                "👀 High speed mode: {:?} → {:?}",
                                prev_status.high_speed_mode, current_status.high_speed_mode
                            ));
                        }

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

                        if current_status.scan_array_pixel_error
                            != prev_status.scan_array_pixel_error
                        {
                            app.log(format!(
                                "👀 Scan array pixel error: {:?} → {:?}",
                                prev_status.scan_array_pixel_error,
                                current_status.scan_array_pixel_error
                            ));
                        }

                        if current_status.scanner_feeder_enabled
                            != prev_status.scanner_feeder_enabled
                        {
                            app.log(format!(
                                "👀 Scanner feeder enabled: {:?} → {:?}",
                                prev_status.scanner_feeder_enabled,
                                current_status.scanner_feeder_enabled
                            ));
                        }

                        if current_status.scanner_ready != prev_status.scanner_ready {
                            app.log(format!(
                                "👀 Scanner ready: {:?} → {:?}",
                                prev_status.scanner_ready, current_status.scanner_ready
                            ));
                        }

                        if current_status.ticket_jam != prev_status.ticket_jam {
                            app.log(format!(
                                "👀 Ticket jam: {:?} → {:?}",
                                prev_status.ticket_jam, current_status.ticket_jam
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
    }

    Ok(())
}
