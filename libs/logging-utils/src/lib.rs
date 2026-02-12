#![deny(clippy::all)]

use std::{
    path::{Path, PathBuf},
    thread,
};

use napi::{bindgen_prelude::*, threadsafe_function::ThreadsafeFunctionCallMode};
use napi_derive::napi;
use vx_logging::{Disposition, EventId, Source};

mod cdf;
mod convert;
mod ser;
mod stream;
mod vx;

/// Convert a VX-formatted log file to a CDF-formatted log file and calls the
/// provided callback after completion.
///
/// # Errors
///
/// Throws if the source is not a known source.
#[napi(ts_args_type = "
    log: (
      eventId: import('@votingworks/logging').LogEventId,
      message: string,
      disposition: import('@votingworks/logging').LogDisposition
    ) => void,
    source: import('@votingworks/logging').LogSource,
    machineId: string,
    codeVersion: string,
    inputPath: string,
    outputPath: string,
    compressed: boolean,
    callback: (error: Error | null) => void,
")]
#[allow(clippy::too_many_arguments)]
#[allow(clippy::needless_pass_by_value)]
pub fn convert_vx_log_to_cdf(
    log: Function<FnArgs<(String, String, String)>, ()>,
    source: String,
    machine_id: String,
    code_version: String,
    input_path: String,
    output_path: String,
    compressed: bool,
    callback: Function<(), ()>,
) -> Result<()> {
    let source: Source = serde_json::from_value(serde_json::Value::String(source.clone()))
        .map_err(|e| {
            Error::new(
                Status::InvalidArg,
                format!("Invalid source value '{source}': {e}"),
            )
        })?;
    let input_path = PathBuf::from(input_path);
    let output_path = PathBuf::from(output_path);

    let log = log
        .build_threadsafe_function::<FnArgs<(String, String, String)>>()
        .build_callback(|ctx| Ok(ctx.value))?;

    let callback = callback
        .build_threadsafe_function()
        .build_callback(|_| Ok(serde_json::Value::Null))?;

    thread::spawn(move || {
        let result = convert_vx_log_to_cdf_impl(
            source,
            &machine_id,
            &code_version,
            &input_path,
            &output_path,
            compressed,
            |event_id, message, disposition| {
                log.call(
                    (event_id.to_string(), message, disposition.to_string()).into(),
                    ThreadsafeFunctionCallMode::NonBlocking,
                );
            },
        );

        callback.call(result, ThreadsafeFunctionCallMode::NonBlocking);
    });

    Ok(())
}

/// Convert a VX-formatted log file to a CDF-formatted log file. Blocks
/// until the conversion is complete.
///
/// This version is meant to be run in a non-main thread.
///
/// # Errors
///
/// Fails if `input_path` cannot be opened for reading, `output_path` cannot be
/// opened for writing, or the CDF JSON cannot be serialized.
pub fn convert_vx_log_to_cdf_impl(
    source: Source,
    machine_id: &str,
    code_version: &str,
    input_path: &Path,
    output_path: &Path,
    compressed: bool,
    log: impl Fn(EventId, String, Disposition),
) -> Result<()> {
    let device_type = device_type_for_source(source);
    let infile = std::fs::File::open(input_path).map_err(|e| {
        Error::new(
            Status::InvalidArg,
            format!(
                "Unable to open {input_path} for reading: {e}",
                input_path = input_path.display()
            ),
        )
    })?;
    let reader = stream::Reader::new(infile, compressed);
    let log_reader = vx::LogReader::new(reader);

    let event_serializer = ser::iterator(log_reader.filter_map(|log_entry| {
        let lineno = log_entry.lineno;
        let error_detail = log_entry.error_detail();
        match cdf::Event::try_from(log_entry) {
            Err(e) => {
                log(
                    EventId::LogConversionToCdfLogLineError,
                    format!(
                        "Malformed log (line {lineno}) identified, log line will be ignored: {error_detail}",
                        error_detail = error_detail.unwrap_or_else(|| e.to_string())
                    ),
                    // result: 'Log line will not be included in CDF output',
                    Disposition::Failure,
                );
                None
            }
            Ok(event) => Some(event),
        }
    }));

    let cdf_event_log = cdf::ElectionEventLog {
        object_type: cdf::ElectionEventLogType::ElectionEventLog,
        generated_time: chrono::offset::Utc::now().to_rfc3339(),
        device: vec![cdf::Device {
            object_type: cdf::DeviceType::Device,
            id: machine_id.to_owned(),
            manufacturer: None,
            model: None,
            other_hash_type: None,
            other_type: None,
            event: event_serializer,
            r#type: device_type,
            version: Some(code_version.to_owned()),
        }],
    };

    let outfile = std::fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(output_path)
        .map_err(|e| {
            Error::new(
                Status::Cancelled,
                format!(
                    "Unable to open {output_path} for writing: {e}",
                    output_path = output_path.display()
                ),
            )
        })?;

    let writer = stream::Writer::new(outfile, compressed);
    serde_json::to_writer(writer, &cdf_event_log).map_err(|e| {
        Error::new(
            Status::Cancelled,
            format!(
                "Failed to write CDF log to {output_path}: {e}",
                output_path = output_path.display()
            ),
        )
    })?;

    log(
        EventId::LogConversionToCdfComplete,
        "Log file successfully converted to CDF format.".to_owned(),
        Disposition::Success,
    );

    Ok(())
}

fn device_type_for_source(source: Source) -> Option<cdf::EventLoggingDeviceType> {
    match source {
        Source::VxAdminFrontend => Some(cdf::EventLoggingDeviceType::Ems),
        Source::VxCentralScanFrontend => Some(cdf::EventLoggingDeviceType::ScanBatch),
        Source::VxScanFrontend => Some(cdf::EventLoggingDeviceType::ScanSingle),
        Source::VxMarkFrontend | Source::VxMarkScanFrontend => {
            Some(cdf::EventLoggingDeviceType::Bmd)
        }
        Source::VxBallotActivationFrontend => Some(cdf::EventLoggingDeviceType::BallotActivation),
        _ => None,
    }
}
