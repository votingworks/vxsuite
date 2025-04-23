#![deny(clippy::all)]

use std::{
    io::{BufReader, BufWriter},
    path::{Path, PathBuf},
    thread,
};

use napi::{
    threadsafe_function::{
        ErrorStrategy, ThreadSafeCallContext, ThreadsafeFunction, ThreadsafeFunctionCallMode,
    },
    Error, JsFunction, Result, Status,
};
use vx_logging::{Disposition, EventId, Source};

mod cdf;
mod convert;
mod ser;
mod vx;

#[macro_use]
extern crate napi_derive;

/// Convert a VX-formatted log file to a CDF-formatted log file and calls the
/// provided callback after completion.
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
    callback: (error: Error | null) => void,
")]
pub fn convert_vx_log_to_cdf(
    log: JsFunction,
    source: String,
    machine_id: String,
    code_version: String,
    input_path: String,
    output_path: String,
    callback: JsFunction,
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

    let log: ThreadsafeFunction<LogData, ErrorStrategy::Fatal> =
        log.create_threadsafe_function(0, |ctx| {
            let LogData {
                event_id,
                message,
                disposition,
            } = ctx.value;
            let event_id = ctx.env.create_string(&event_id.to_string())?;
            let message = ctx.env.create_string(&message)?;
            let disposition = ctx.env.create_string(&disposition.to_string())?;
            Ok(vec![
                event_id.into_unknown(),
                message.into_unknown(),
                disposition.into_unknown(),
            ])
        })?;

    let callback: ThreadsafeFunction<(), ErrorStrategy::CalleeHandled> = callback
        .create_threadsafe_function(0, |_: ThreadSafeCallContext<()>| Ok(Vec::<()>::new()))?;

    thread::spawn(move || {
        let result = convert_vx_log_to_cdf_impl(
            source,
            machine_id,
            code_version,
            &input_path,
            &output_path,
            |event_id, message, disposition| {
                log.call(
                    LogData {
                        event_id,
                        message,
                        disposition,
                    },
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
pub fn convert_vx_log_to_cdf_impl(
    source: Source,
    machine_id: String,
    code_version: String,
    input_path: &Path,
    output_path: &Path,
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
    let reader = BufReader::new(infile);
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
            id: machine_id.clone(),
            manufacturer: None,
            model: None,
            other_hash_type: None,
            other_type: None,
            event: event_serializer,
            r#type: device_type,
            version: Some(code_version.clone()),
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

    serde_json::to_writer(BufWriter::new(outfile), &cdf_event_log).map_err(|e| {
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

struct LogData {
    event_id: EventId,
    message: String,
    disposition: Disposition,
}
