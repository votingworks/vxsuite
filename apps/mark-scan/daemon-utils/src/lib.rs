use std::{
    fs::OpenOptions,
    io::{self, Write},
    path::Path,
    process,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread::sleep,
    time::{Duration, Instant},
};
use vx_logging::{log, EventId, EventType};

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);
const NOOP_LOOP_INTERVAL: Duration = Duration::from_secs(1);

pub fn run_no_op_event_loop(running: &Arc<AtomicBool>) {
    log!(
        EventId::Info,
        "Connection will not be reattempted. Running a no-op loop, ctrl+c to exit."
    );

    let mut last_heartbeat_log_time = Instant::now();
    loop {
        if !running.load(Ordering::SeqCst) {
            log!(
                EventId::ProcessTerminated;
                EventType::SystemAction
            );
            break;
        }

        if last_heartbeat_log_time.elapsed() > HEARTBEAT_INTERVAL {
            log!(
                EventId::Heartbeat;
                EventType::SystemStatus
            );

            last_heartbeat_log_time = Instant::now();
        }

        // Separate loop and heartbeat intervals allow for faster response to kill signal
        // without spamming heartbeat logs
        sleep(NOOP_LOOP_INTERVAL);
    }
}

/// Writes a PID file containing the daemon's process ID to be checked by the mark-scan app.
/// # Errors
/// Bubbles up any `io::Error` resulting from opening or writing PID file.
pub fn write_pid_file(workspace_path: &Path, pid_filename: &str) -> Result<(), io::Error> {
    let pid = process::id();

    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(workspace_path.join(pid_filename))?;

    file.write_all(pid.to_string().as_bytes())
}
