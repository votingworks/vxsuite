use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread::sleep,
    time::{Duration, Instant},
};
use vx_logging::{log, EventId, EventType};

const HEARTBEAT_INTERVAL: Duration = Duration::new(5, 0);
const NOOP_LOOP_INTERVAL: Duration = Duration::new(1, 0);

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
