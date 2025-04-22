#![deny(clippy::all)]

use std::{
    io::{BufReader, BufWriter},
    path::{Path, PathBuf},
};

use napi::{
    threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode},
    Error, JsFunction, JsObject, JsString, Result, Status,
};
use vx_logging::{Disposition, EventId, Source};

mod cdf;
mod convert;
mod ser;
mod vx;

#[macro_use]
extern crate napi_derive;

/// Convert a VX-formatted log file to a CDF-formatted log file.
#[napi(ts_args_type = "
    logger: import('@votingworks/logging').Logger,
    machineId: string,
    codeVersion: string,
    inputPath: string,
    outputPath: string
")]
pub fn convert_vx_log_to_cdf(
    logger: JsObject,
    machine_id: String,
    code_version: String,
    input_path: String,
    output_path: String,
) -> Result<()> {
    let Some(get_source) = logger.get::<_, JsFunction>("getSource")? else {
        return Err(Error::new(
            Status::InvalidArg,
            "Logger does not have `getSource` method",
        ));
    };
    let Some(log_as_current_role) = logger.get::<_, JsFunction>("logAsCurrentRole")? else {
        return Err(Error::new(
            Status::InvalidArg,
            "Logger does not have `logAsCurrentRole` method",
        ));
    };
    let source = get_source
        .apply0::<JsString, _>(&logger)?
        .into_utf8()?
        .into_owned()?;
    let source: Source = serde_json::from_value(serde_json::Value::String(source.clone()))
        .map_err(|e| {
            Error::new(
                Status::InvalidArg,
                format!("Invalid source value '{source}': {e}"),
            )
        })?;
    let input_path = PathBuf::from(input_path);
    let output_path = PathBuf::from(output_path);

    let log_as_current_role: ThreadsafeFunction<LogData, ErrorStrategy::Fatal> =
        log_as_current_role.create_threadsafe_function(0, |ctx| {
            let LogData {
                event_id,
                message,
                disposition,
            } = ctx.value;
            let mut log_data = ctx.env.create_object().expect("create_object succeeds");
            log_data
                .set("message", message)
                .expect("Set `logData.message` succeeds");
            log_data
                .set("disposition", disposition.to_string())
                .expect("Set `logData.disposition` succeeds");
            Ok(vec![
                ctx.env
                    .create_string(&event_id.to_string())
                    .expect("create_string succeeds")
                    .into_unknown(),
                log_data.into_unknown(),
            ])
        })?;

    convert_vx_log_to_cdf_impl(
        source,
        machine_id,
        code_version,
        &input_path,
        &output_path,
        |event_id, message, disposition| {
            log_as_current_role.call(
                LogData {
                    event_id,
                    message,
                    disposition,
                },
                ThreadsafeFunctionCallMode::NonBlocking,
            );
        },
    )
}

/// Convert a VX-formatted log file to a CDF-formatted log file.
///
/// Separated from `convert_vx_log_to_cdf` because tooling struggles with
/// `#[napi]`-annotated values.
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
