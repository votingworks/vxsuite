# Print Job Status Tracking

**Author:** @kshen0

## Existing Discussion

- https://github.com/votingworks/vxsuite/issues/9186
- [VxSuite Print Tracking Limitations](https://docs.google.com/document/d/1_4kJRrqcMXAerx8-M6kkqe4Wj-9yJsjyL6JOIAMp0Ks/edit?tab=t.0#heading=h.l932348m6v4m)

## Problem

VxSuite currently has a very limited understanding of the status of print jobs.
Currently, the application

- submits a print job to CUPS
- waits for the job to be accepted
- reports success in logging and UI

Downstream failures like jams, insufficient paper, or pulling the printer cable
out are clear failures that are represented as success in the logs, user-facing
messages, and ballots printed count. We want VxMark and VxPrint to instead
accurately track and represent print job status.

## Proposal

### Prerequisites

**`lp` migration**

Migrate `Printer` abstraction to use `lp` instead of `lpr`. The former reports
print job ID that can be used to query job status. This was done in
https://github.com/votingworks/vxsuite/issues/9186.

**Concatenate VxPrint's "Print All Ballot Styles" into a single job**

This feature currently enqueues 1 job for each ballot style. We should
concatenate the ballots into a single long job for easier job tracking.

### Extend `libs/printing`

**Extend `PrinterDevice`**

`PrinterDevice` tracks the necessary state for a caller to maintain a connection
to a supported printer. The state is isolated to `libs/printing` and not exposed
to the caller. An instance of `Printer` is exposed to the caller by
`detectPrinter` (production) or `MockFilePrinter`.

```
interface PrinterDevice {
  uri?: string;
  lastPrint: number;
}

export interface Printer {
  status: () => Promise<PrinterStatus>;
  print: PrintFunction;
}
```

We'll extend `PrinterDevice` to track jobs:

```
type JobId = number;

export type JobState =
   // `ipptool` states
  | 'pending'
  | 'pending-held'
  | 'processing'
  | 'processing-stopped'
  | 'canceled'
  | 'aborted'
  | 'completed'
  // Additional states
  | 'stalled' ;

export interface JobStatus {
   state: JobState;
   sheetsCompleted: number;
   lastProgressAt: Date;
   reason?: string;
}

interface PrinterDevice {
  uri?: string;
  lastPrint: number;
  // New state
  jobs: Map<JobId, JobStatus>;
}
export interface Printer {
  status: () => Promise<PrinterStatus>;
  print: PrintFunction;
  // New methods
  getJobStatus: (jobId: JobId) => Result<JobStatus, Error>;
  clearJobQueue: () => Promise<void>;
}
```

**IPP Endpoints**

TODO

**`Printer.print()`**

When a print job is initiated by `print()`, kick off a monitor responsible for

- polling `ipptool` for the job's status
- storing updated status in `PrinterDevice.jobs`
- logging for print job success and failure

Logging redundant with the above logging cases will be removed from VxSuite
apps. Polling ceases when the job reaches a terminal state.

The monitor is necessary because VxMark and VxPrint will read the status from 2
different places (more on these later):

1. The API endpoint polled by the frontend to read and display print job status
2. The backend monitor responsible for deciding what to log and when to clear
   the print queue

Having one monitor per job to poll `ipptool` rather than update in
`Printer.getJobStatus()` allows us to have multiple callers of that function
without unnecessary or overlapping `ipptool` calls.

The monitor will be implemented like `libs/backend`'s `startCpuMetricsLogging`:

```
export function startCpuMetricsLogging(
  logger: BaseLogger,
  { interval = 60_000, topProcessCount = 5 } = {}
): { stop(): void }
```

In more detail, the monitor

1. Gets updated job status from `ipptool`.
2. Decides when a job is stalled and marks it as such.
   - On each call to `ipptool` to update status, it checks `sheetsCompleted` and
     `lastProgressAt` of every job.
   - The job is marked as `stalled` if `sheetsCompleted` hasn't changed and
     `lastProgressAt` was before some constant `JOB_STALLED_TIMEOUT` time ago.
     `stalled` status takes priority over native CUPS job state and is not
     overwritten (see 3, below).
   - `stalled` status detection for the first sheet printed should be longer
     than subsequent sheets. This is because enqueuing a long print job (long
     reports, test decks, all ballot styles, etc) may take several seconds to
     begin printing. A ~5 second delay for printing the first sheet isn't
     unreasonable, but a 5 second delay between sheets 1 and 2 is more likely to
     indicate a stall.
3. Stores the following in `PrinterDevice.JobStatus`
   - job state (with priority to `stalled`)
   - number of sheets completed
   - reason for job state from `ipptool` output `printer-state-reasons` and
     possibly `job-state-reasons`
   - timestamp

**`Printer.getJobStatus(jobId): Result<JobStatus, Error>`**

Looks up the specified job in `PrinterDevice.jobs` and returns its status.
Returns an error if the job does not exist in the map.

**`Printer.clearJobQueue()`**

Runs `Cancel-Jobs` to clear CUPS queue. Does not change status in
`PrinterDevice.jobs`.

**Mocks**

`createMockPrinterHandler` and `MockFilePrinter` need to support new status
tracking behavior.

### Update VxMark and VxPrint

VxSuite apps currently show a "Printing ..." message for a hardcoded n seconds
then assume the job is done. The answer to the question "is the print job done?"
should be isolated to the backend.

To that end we will make the following API changes in VxMark and VxPrint:

1. `print()` endpoints start a monitor whose job is to
   - poll `Printer.getJobStatus(jobId)`
   - increment ballot print count on success
   - call `clearJobQueue()` on failure or stall
   - emit app-specific logs not covered by `libs/printing`
   - terminate when a job reaches a terminal state and cleanup is done
2. Add `getJobStatus(jobId): Result<JobStatus, Error>` endpoint to app backends.
   This endpoint wraps `getJobStatus(jobId)`.

The new end to end VxMark and VxPrint app flows:

- Frontend initiates print request to backend
- Backend initiates the print job and receives a job ID
- Backend starts the monitor. The monitor polls the print job's status and
  executes app-specific logic: maintaining ballot print count and clearing the
  print queue on failure
- Backend returns the job ID to the frontend
- Frontend polls `getJobStatus(jobId)` and displays the status
  - If a job is reported as failed or stalled, display an error message and the
    reason why
  - After a constant delay shared by the backend monitor automatically navigate
    to the previous page

### Logging

In `libs/printing`:

1. `Printer.print()` emits `PrinterPrintRequest`
2. `Printer`'s monitor emits `PrinterPrintComplete` with failure/success
   dispotiion on state transition to a terminal state

In `VxMark` and `VxPrint`:

1. TODO

## Alternatives Considered

TODO

## Open Questions

TODO
