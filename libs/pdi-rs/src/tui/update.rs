use std::time::Duration;

use anyhow::Result;
use crossterm::event::{self, Event::Key, KeyCode::Char};

use crate::pdiscan::EjectDirection;

use super::{
    app::App,
    config::{AutoScanConfig, WatchStatusConfig, EJECT_DELAY_STEP},
};

pub(crate) fn update(app: &mut App) -> Result<()> {
    if let Some(ref scanner) = app.get_scanner() {
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
