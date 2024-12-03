//! Inter-process communication (IPC) between the [`WebView`] and the Rust
//! application. This module sets up the `kiosk.*` APIs in the [`WebView`] and
//! the Rust handler for processing messages sent from the [`WebView`].

use anyhow::Context;
use base64_serde::base64_serde_type;
use futures::channel::oneshot;
use gtk::prelude::*;
use serde::{Deserialize, Serialize};
use webkit2gtk::{
    SnapshotOptions, UserContentInjectedFrames, UserContentManagerExt, UserScript,
    UserScriptInjectionTime, WebView, WebViewExt,
};

use crate::ui;

base64_serde_type!(Base64Standard, base64::engine::general_purpose::STANDARD);

/// Messages that can be sent from the [`WebView`] to the Rust application.
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum Message {
    /// Log a message to the console.
    #[serde(rename_all = "camelCase")]
    Log { message: String },

    /// Quit the application.
    Quit,

    /// Capture a screenshot of the current web view.
    #[serde(rename_all = "camelCase")]
    CaptureScreenshot {
        #[serde(flatten)]
        options: CaptureScreenshotOptions,
    },

    /// Show an open file dialog and return the selected file paths.
    #[serde(rename_all = "camelCase")]
    ShowOpenDialog {
        #[serde(flatten)]
        options: ShowOpenDialogOptions,
    },
}

/// Options for the `kiosk.captureScreenshot` API.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureScreenshotOptions {
    /// The ID of the message to reply to. Internal use only.
    reply_to: String,
}

/// Options for the `kiosk.showOpenDialog` API.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowOpenDialogOptions {
    /// The ID of the message to reply to. Internal use only.
    reply_to: String,

    /// The actual options for the file chooser dialog.
    #[serde(flatten)]
    inner: ui::FileChooserOptions,
}

/// Replies that can be sent from the Rust application to the [`WebView`].
#[derive(Debug, Serialize)]
#[serde(tag = "type")]
pub enum Reply {
    /// Reply with a captured screenshot.
    #[serde(rename_all = "camelCase")]
    CaptureScreenshot {
        /// The ID of the message this is a reply to. Internal use only.
        in_reply_to: String,

        /// The screenshot data as a PNG image (base64-encoded in JSON).
        #[serde(with = "Base64Standard")]
        data: Vec<u8>,
    },

    /// Reply with the selected file paths from an open file dialog.
    #[serde(rename_all = "camelCase")]
    ShowOpenDialog {
        /// The ID of the message this is a reply to. Internal use only.
        in_reply_to: String,

        /// Whether the dialog was canceled.
        canceled: bool,

        /// The selected file paths.
        file_paths: Vec<String>,
    },

    /// Reply for errors that occurred during processing.
    #[serde(rename_all = "camelCase")]
    Error { message: String },
}

/// Set up `kiosk.*` APIs in the [`WebView`] and the Rust handler.
pub fn setup(window: &gtk::Window, webview: &WebView) -> anyhow::Result<()> {
    let manager = webview
        .user_content_manager()
        .context("Failed to get user content manager")?;
    manager.connect_script_message_received(None, {
        let window = window.clone();
        let webview = webview.clone();
        move |_, message| {
            if let Some(value) = message.js_value() {
                gtk::glib::spawn_future_local({
                    let window = window.clone();
                    let webview = webview.clone();
                    async move {
                        let reply = match serde_json::from_str::<Message>(&value.to_string()) {
                            Ok(Message::Log { message }) => {
                                // pass through log messages as-is to stdout
                                println!("{message}");
                                return;
                            }
                            Ok(Message::Quit) => {
                                // tell the main loop to quit gracefully
                                gtk::main_quit();
                                return;
                            }
                            Ok(Message::CaptureScreenshot { options }) => {
                                capture_screenshot(&webview, options)
                                    .await
                                    .unwrap_or_else(|_| Reply::Error {
                                        message: "captureScreenshot was canceled".to_owned(),
                                    })
                            }
                            Ok(Message::ShowOpenDialog { options }) => {
                                show_open_dialog(&window, options)
                                    .await
                                    .unwrap_or_else(|_| Reply::Error {
                                        message: "showOpenDialog was canceled".to_owned(),
                                    })
                            }
                            Err(e) => Reply::Error {
                                message: format!("Failed to parse IPC message: {e}"),
                            },
                        };

                        let reply =
                            serde_json::to_string(&reply).expect("JSON serialization failed");
                        webview
                            .evaluate_javascript_future(
                                &format!("window.postMessage({reply})"),
                                None,
                                None,
                            )
                            .await
                            .expect("Failed to send IPC reply");
                    }
                });
            }
        }
    });

    // Add an object to the JavaScript global object that we can use to send IPC
    // messages. Registers after setting up the IPC message handler per the
    // documentation.
    manager.register_script_message_handler("ipc");

    // Inject the kiosk.js script into the top frame of the web view on every
    // page load. Ensures that the kiosk API is available in all pages.
    manager.add_script(&UserScript::new(
        include_str!("../kiosk.js"),
        UserContentInjectedFrames::TopFrame,
        UserScriptInjectionTime::Start,
        &[],
        &[],
    ));

    Ok(())
}

/// Capture a screenshot of the current web view.
pub fn capture_screenshot(
    webview: &WebView,
    options: CaptureScreenshotOptions,
) -> futures::channel::oneshot::Receiver<Reply> {
    // This function uses a channel to send the reply back to the caller instead
    // of just being an async function because passing a `WebView` reference to
    // an async function would require a `Send` bound on the `WebView` type.
    // Since it wraps a pointer type, it is not `Send` and cannot be passed
    // between threads. The channel is a workaround to avoid this issue.
    let (tx, rx) = oneshot::channel();

    webview.snapshot(
        webkit2gtk::SnapshotRegion::Visible,
        SnapshotOptions::all(),
        None::<&gtk::gio::Cancellable>,
        |result| {
            let reply = match result {
                Ok(snapshot) => {
                    let mut data = vec![];
                    if let Err(e) = snapshot.write_to_png(&mut data) {
                        Reply::Error {
                            message: format!("Failed to write snapshot to PNG: {e}"),
                        }
                    } else {
                        Reply::CaptureScreenshot {
                            in_reply_to: options.reply_to,
                            data,
                        }
                    }
                }
                Err(e) => Reply::Error {
                    message: format!("Failed to take snapshot: {e}"),
                },
            };

            // Send the reply back, but ignore failure if there is no receiver.
            let _ = tx.send(reply);
        },
    );

    rx
}

/// Show an open file dialog and return the selected file paths.
pub fn show_open_dialog(
    window: &gtk::Window,
    options: ShowOpenDialogOptions,
) -> oneshot::Receiver<Reply> {
    // This function uses a channel to send the reply back to the caller instead
    // of just being an async function because passing a `gtk::Window` reference
    // to an async function would require a `Send` bound on the `gtk::Window`
    // type. Since it wraps a pointer type, it is not `Send` and cannot be
    // passed between threads. The channel is a workaround to avoid this issue.
    let (tx, rx) = oneshot::channel();

    gtk::glib::spawn_future_local({
        let window = window.clone();
        async move {
            let dialog = ui::file_chooser(&window, &options.inner);
            let reply = match dialog.run_future().await {
                gtk::ResponseType::Accept => {
                    let file_paths = dialog
                        .filenames()
                        .iter()
                        .map(|path| path.to_string_lossy().to_string())
                        .collect();
                    Reply::ShowOpenDialog {
                        in_reply_to: options.reply_to,
                        canceled: false,
                        file_paths,
                    }
                }
                _ => Reply::ShowOpenDialog {
                    in_reply_to: options.reply_to,
                    canceled: true,
                    file_paths: vec![],
                },
            };
            dialog.close();

            // Send the reply back, but ignore failure if there is no receiver.
            let _ = tx.send(reply);
        }
    });

    rx
}
