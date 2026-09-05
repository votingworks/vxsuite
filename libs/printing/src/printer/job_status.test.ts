import { beforeEach, expect, test, vi } from 'vitest';
import { err, ok } from '@votingworks/basics';
import { IppJobState, PrintJobOutcome } from '@votingworks/types';
import {
  CUPS_SCHEDULER_IPP_URI,
  GET_JOB_ATTRIBUTES_QUERY_PATH,
  classifyJobState,
  queryJobStatus,
} from './job_status';
import { exec } from '../utils/exec';

vi.mock('../utils/exec', async () => ({
  ...(await vi.importActual('../utils/exec')),
  exec: vi.fn(),
}));

const execMock = vi.mocked(exec);

beforeEach(() => {
  execMock.mockReset();
});

function mockIpptoolStdout({
  statusLine = 'status-code = successful-ok (successful-ok)',
  body = '',
}: { statusLine?: string; body?: string } = {}): string {
  return `"/tmp/query":
      Get-Job-Attributes:
          attributes-charset (charset) = utf-8
      /tmp/query                                                           [PASS]
          RECEIVED: 121 bytes in response
          ${statusLine}
          attributes-charset (charset) = utf-8
          attributes-natural-language (naturalLanguage) = en
${body}`;
}

function mockJobResponse(state: IppJobState, message = ''): void {
  execMock.mockResolvedValue(
    ok({
      stdout: mockIpptoolStdout({
        body: `          job-state (enum) = ${state}
          job-printer-state-message (textWithoutLanguage) =${
            message ? ` ${message}` : ''
          }`,
      }),
      stderr: '',
    })
  );
}

test('queries the CUPS scheduler for the given job', async () => {
  mockJobResponse('completed');

  expect((await queryJobStatus(42)).unsafeUnwrap()).toEqual({
    outcome: 'sent-to-printer',
    reason: undefined,
  });

  expect(execMock).toHaveBeenCalledWith('ipptool', [
    '-T',
    '5',
    '-tv',
    '-d',
    'job-id=42',
    CUPS_SCHEDULER_IPP_URI,
    GET_JOB_ATTRIBUTES_QUERY_PATH,
  ]);
});

test('reports the diagnostic message for a failed job', async () => {
  mockJobResponse('aborted', 'Unable to send data to printer.');

  expect((await queryJobStatus(42)).unsafeUnwrap()).toEqual({
    outcome: 'failed',
    reason: 'Unable to send data to printer.',
  });
});

test('returns an error when CUPS does not know the job', async () => {
  execMock.mockResolvedValue(
    ok({
      stdout: mockIpptoolStdout({
        statusLine:
          'status-code = client-error-not-found (Job #999 does not exist.)',
        body: '          status-message (textWithoutLanguage) = Job #999 does not exist.',
      }),
      stderr: '',
    })
  );

  const result = await queryJobStatus(999);
  expect(result.err()).toEqual({
    type: 'unknown-job',
    message:
      'CUPS did not return job 999: status-code = client-error-not-found (Job #999 does not exist.)',
  });
});

test('returns an error when ipptool itself fails', async () => {
  execMock.mockResolvedValue(
    err({
      code: 1,
      signal: null,
      stdout: '',
      stderr: 'ipptool: Unable to connect\n',
      cmd: 'ipptool',
    })
  );

  const result = await queryJobStatus(42);
  expect(result.err()).toEqual({
    type: 'query-failed',
    message: 'ipptool failed: ipptool: Unable to connect',
  });
});

test.each<[IppJobState, PrintJobOutcome]>([
  ['pending', 'in-progress'],
  ['pending-held', 'in-progress'],
  ['processing', 'in-progress'],
  ['processing-stopped', 'in-progress'],
  ['completed', 'sent-to-printer'],
  ['canceled', 'failed'],
  ['aborted', 'failed'],
])('classifies %s as %s', (state, outcome) => {
  expect(classifyJobState(state)).toEqual(outcome);
});
