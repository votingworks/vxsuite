# Print Job Status Tracking

**Author:** @kshen0

## Existing Discussion

- https://github.com/votingworks/vxsuite/issues/9186
- [VxSuite Print Tracking Limitations](https://docs.google.com/document/d/1_4kJRrqcMXAerx8-M6kkqe4Wj-9yJsjyL6JOIAMp0Ks/edit?tab=t.0#heading=h.l932348m6v4m)

## Problem

VxSuite currently has a limited understanding of the status of print jobs.
Currently, the application

- submits a print job to CUPS
- reports success in logging and UI regardless of job status

Jams, insufficient paper, or pulling the printer cable out are failures that are
downstream of the app handing the job to CUPS. Such failures are incorrectly
represented as success in the logs, user-facing messages, and "Ballots Printed"
count. Rather than report a false success, we want VxMark and VxPrint to instead
accurately track print job status and report when CUPS fails to send the job to
the printer.

## Proposal

### Context: Existing printer state tracking

An instance of `Printer` is provided to the caller by `detectPrinter`
(production) or `MockFilePrinter`. `Printer` closes over `PrinterDevice`, which
tracks the necessary state for a caller to maintain a connection to a printer.

```
// Private to libs/printing
interface PrinterDevice {
  uri?: string;
  lastPrint: number;
}

// Exposed to VxSuite
export interface Printer {
  status: () => Promise<PrinterStatus>;
  print: PrintFunction;
}
```

### Proposal

Per the product spec we'll report when a job has been successfully submitted to
the CUPS scheduler and CUPS has successfully transferred the job to the printer.
Downstream issues like jams mid-print will be displayed and handled on printer
hardware.

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

We'll extend `PrinterDevice` to track jobs:

```
type JobId = number;

// IPP `job-state`, as reported by `ipptool` when querying CUPS.
type IppJobState =
  | 'pending'
  | 'pending-held'
  | 'processing'
  | 'processing-stopped' // Not observed during testing but included for completeness
  | 'canceled'
  | 'aborted'
  | 'completed';

export type JobOutcome = 'in-progress' | 'sent-to-printer' | 'failed';

function classify(state: IppJobState): JobOutcome {
  switch (state) {
    case 'completed':
      return 'sent-to-printer';
    case 'canceled':
    case 'aborted':
      return 'failed';
    case 'pending':
    case 'pending-held':
    case 'processing':
    case 'processing-stopped':
      return 'in-progress';
    default:
      throwIllegalValue(state);
  }
}

export interface JobStatus {
   outcome: JobOutcome;
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

**`Printer.print()`**

When a print job is initiated by `print()`, kick off a monitor responsible for
polling CUPS for job status. CUPS reports 2 bits of information we care about:

- `job-state`, 1 of 7 states for a job encoded by `IppJobState`
- `job-printer-state-message`: diagnostic text about the job's state

Example real output from querying CUPS via `ipptool`:

```
RECEIVED: 152 bytes in response
status-code = successful-ok (successful-ok)
attributes-charset (charset) = utf-8
attributes-natural-language (naturalLanguage) = en
job-state (enum) = aborted
job-printer-state-message (textWithoutLanguage) = Unable to send data to printer.
```

The monitor's flow is roughly:

- poll `ipptool` for the job's state
- classify `job-state` into abstracted `JobOutcome`
- store updated `JobOutcome` in `PrinterDevice.jobs.outcome`
- store `job-printer-state-message` in `PrinterDevice.jobs.reason`
- log when print job succeeds or fails
- store a `failure` `JobOutcome` if a job runs for longer than `JOB_TIMEOUT`
  from monitor start. Likely unnecessary because failures should report as
  `aborted`, but protects us from hanging indefinitely.
- schedule deletion of the job from `PrinterDevice.jobs` upon job reaching
  terminal state

Logging that's redundant with the above logging cases will be removed from
VxSuite apps. Polling ceases when the job reaches a terminal `JobOutcome` i.e.
`outcome !== 'in-progress'`.

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

**`Printer.getJobStatus(jobId): Result<JobStatus, Error>`**

Looks up the specified job in `PrinterDevice.jobs` and returns its status.
Returns an error if the job does not exist in the map.

**`Printer.clearJobQueue()`**

Runs `Cancel-Jobs` to clear CUPS queue. Does not change status in
`PrinterDevice.jobs`.

**`Printer.status()`**

Update `Printer.status()` to `clearJobQueue()` when it detects the printer is
disconnected (it already knows when this happens).

**Tooling**

We'll query CUPS via `ipptool`, sketched out below.

1. Define query file

```
// 'get-job-attributes.ipp'
{
  OPERATION Get-Job-Attributes
  GROUP operation-attributes-tag
  ATTR charset attributes-charset utf-8
  ATTR language attributes-natural-language en
  ATTR uri printer-uri $uri
  ATTR integer job-id $job-id
  ATTR keyword requested-attributes job-state,job-printer-state-message
}
```

2. Shell out to `ipptool`

```
  // :631 is CUPS's IPP endpoint
  // Don't use CUPS_DEFAULT_IPP_URI because that addresses printer via ipp-usb
  const CUPS_SCHEDULER_IPP_URI = `ipp://localhost:631/printers/${DEFAULT_MANAGED_PRINTER_NAME}`;

  const GET_JOB_ATTRIBUTES_QUERY = join(
    __dirname,
    RELATIVE_PATH_TO_IPP_QUERIES,
    'get-job-attributes.ipp'
  );

  const ipptoolArgs = [
    // Specify timeout
    '-T',
    IPPTOOL_TIMEOUT_SECONDS,
    // -t: "Specifies that CUPS test report output is desired instead of the
    //     plain text output."
    // -v: "Specifies that all request and response attributes should be output
    //     in CUPS test mode (-t)."
    // Combined, these format the output to the expectation of existing `parseIpptoolOutput`
    '-tv',
    //  -d name=value: "Defines the named variable"; in this case, job-id
    '-d',
    `job-id=${jobId}`,
    CUPS_SCHEDULER_IPP_URI,
    // File containing query args in step 1
    GET_JOB_ATTRIBUTES_QUERY,
  ];
```

**Mocks**

`createMockPrinterHandler` and `MockFilePrinter` need to support new status
tracking behavior.

**Update printer config**

Set the error policy to abort failed jobs to avoid the "5 minute delayed print"
problem:

```
lpadmin -p VxPrinter ... -o printer-error-policy=abort-job
```

### Update VxMark and VxPrint

VxSuite apps currently show a "Printing ..." message for a hardcoded n seconds
then assume the job is done. The answer to the question "is the print job done?"
should be isolated to the backend.

To that end we will make the following API changes in VxMark and VxPrint:

1. `print()` endpoints start an app-side (not lib-side) monitor whose
   responsibility is to
   - poll `Printer.getJobStatus(jobId)`
   - increment ballot print count on transition to `sent-to-printer` status
   - call `clearJobQueue()` on failure
   - emit app-specific logs not covered by `libs/printing`
   - terminate itself
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

### Logging

In `libs/printing`:

1. `Printer.print()` emits `PrinterPrintRequest`
2. `Printer`'s monitor emits `PrinterPrintComplete` with failure/success
   disposition on state transition to a terminal `JobOutcome`

In `VxMark` and `VxPrint`:

VxPrint uses `PrinterPrintRequest` for app-domain logs that have knowledge of
ballot styles and number of ballots printed. Since `PrinterPrintRequest` will be
moved to `libs/printing`, and to avoid redundancy, we'll add a `BallotPrinted`
log event for use in VxPrint.

## Alternatives Considered

**`lpstat` instead of `ipptool`**

`lpstat` has cleaner ergonomics than `ipptool` for querying CUPS. But it never
reports `job-state`. Completed and aborted jobs render identically apart from a
free-text `Status:` line, so success and failure cannot be reliably
distinguished. It's also more brittle to parse its human-readable output, and
completed and incomplete jobs must be queried separately.

## Open Questions

None at the moment.
