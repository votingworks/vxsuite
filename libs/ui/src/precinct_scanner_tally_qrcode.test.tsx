import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import {
  electionSample,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import {
  BallotIdSchema,
  CastVoteRecord,
  unsafeParse,
} from '@votingworks/types';
import {
  calculateTallyForCastVoteRecords,
  compressTally,
  deferred,
} from '@votingworks/utils';
import { fakeKiosk, mockOf } from '@votingworks/test-utils';

import { PrecinctScannerTallyQrCode } from './precinct_scanner_tally_qrcode';

afterEach(() => {
  window.kiosk = undefined;
});

const time = new Date(2021, 8, 19, 11, 5).getTime();

const cvr: CastVoteRecord = {
  _precinctId: electionSample.precincts[0].id,
  _ballotId: unsafeParse(BallotIdSchema, 'test-123'),
  _ballotStyleId: electionSample.ballotStyles[0].id,
  _batchId: 'batch-1',
  _batchLabel: 'batch-1',
  _ballotType: 'standard',
  _testBallot: false,
  _scannerId: 'DEMO-0000',
  'county-commissioners': ['argent'],
};

test('renders WITHOUT results reporting when there are CVRs but polls are open', () => {
  const mockKiosk = fakeKiosk();
  mockOf(mockKiosk.sign).mockResolvedValue('FAKESIGNATURE');
  window.kiosk = mockKiosk;

  const tally = calculateTallyForCastVoteRecords(
    electionSample,
    new Set([cvr])
  );
  const compressedTally = compressTally(electionSample, tally);

  render(
    <PrecinctScannerTallyQrCode
      reportSavedTime={time}
      electionDefinition={electionSampleDefinition}
      reportPurpose="Testing"
      isPollsOpen
      isLiveMode
      compressedTally={compressedTally}
      signingMachineId="0001"
    />
  );

  expect(screen.queryByText('Automatic Election Results Reporting')).toBeNull();
});

test('renders with results reporting when there are CVRs and polls are closed', async () => {
  const mockKiosk = fakeKiosk();
  mockOf(mockKiosk.sign).mockResolvedValue('FAKESIGNATURE');
  window.kiosk = mockKiosk;

  const tally = calculateTallyForCastVoteRecords(
    electionSample,
    new Set([cvr])
  );
  const compressedTally = compressTally(electionSample, tally);

  render(
    <PrecinctScannerTallyQrCode
      reportSavedTime={time}
      electionDefinition={electionSampleDefinition}
      reportPurpose="Testing"
      isPollsOpen={false}
      isLiveMode
      compressedTally={compressedTally}
      signingMachineId="DEMO-0000"
    />
  );

  const payloadComponents = mockKiosk.sign.mock.calls[0][0].payload.split('.');
  expect(payloadComponents).toEqual([
    electionSampleDefinition.electionHash,
    'DEMO-0000',
    '1', // live election
    expect.any(String),
    expect.any(String),
  ]);

  await waitFor(() =>
    expect(
      screen.queryByText('Automatic Election Results Reporting')
    ).toBeInTheDocument()
  );
});

test('renders with results reporting when there are CVRs and polls are closed in testing mode', async () => {
  const mockKiosk = fakeKiosk();
  mockOf(mockKiosk.sign).mockResolvedValue('FAKESIGNATURE');
  window.kiosk = mockKiosk;

  const testCvr: CastVoteRecord = {
    ...cvr,
    _testBallot: true,
  };
  const tally = calculateTallyForCastVoteRecords(
    electionSample,
    new Set([testCvr])
  );
  const compressedTally = compressTally(electionSample, tally);

  render(
    <PrecinctScannerTallyQrCode
      reportSavedTime={time}
      electionDefinition={electionSampleDefinition}
      reportPurpose="Testing"
      isPollsOpen={false}
      isLiveMode={false}
      compressedTally={compressedTally}
      signingMachineId="DEMO-0000"
    />
  );

  const payloadComponents = mockKiosk.sign.mock.calls[0][0].payload.split('.');
  expect(payloadComponents).toEqual([
    electionSampleDefinition.electionHash,
    'DEMO-0000',
    '0', // live election
    expect.any(String),
    expect.any(String),
  ]);

  await waitFor(() =>
    expect(
      screen.queryByText('Automatic Election Results Reporting')
    ).toBeInTheDocument()
  );
});

test('renders with unsigned results reporting when there is no kiosk', async () => {
  window.kiosk = undefined;
  const tally = calculateTallyForCastVoteRecords(
    electionSample,
    new Set([cvr])
  );
  const compressedTally = compressTally(electionSample, tally);

  render(
    <PrecinctScannerTallyQrCode
      reportSavedTime={time}
      electionDefinition={electionSampleDefinition}
      reportPurpose="Testing"
      isPollsOpen={false}
      isLiveMode
      compressedTally={compressedTally}
      signingMachineId="DEMO-0000"
    />
  );

  await waitFor(() =>
    expect(
      screen.queryByText('Automatic Election Results Reporting')
    ).toBeInTheDocument()
  );
});

test('renders the correct signature on re-renders', async () => {
  jest.useFakeTimers().setSystemTime(time);

  const mockKiosk = fakeKiosk();
  const firstSignDeferred = deferred<string>();
  const secondSignDeferred = deferred<string>();

  mockOf(mockKiosk.sign)
    .mockReturnValueOnce(firstSignDeferred.promise)
    .mockReturnValueOnce(secondSignDeferred.promise);
  window.kiosk = mockKiosk;

  const tally = calculateTallyForCastVoteRecords(
    electionSample,
    new Set([cvr])
  );
  const compressedTally = compressTally(electionSample, tally);

  const { rerender } = render(
    <PrecinctScannerTallyQrCode
      reportSavedTime={time}
      electionDefinition={electionSampleDefinition}
      reportPurpose="Testing"
      isPollsOpen={false}
      isLiveMode
      compressedTally={compressedTally}
      signingMachineId="DEMO-0000"
    />
  );

  // trigger a re-render with a new signature
  rerender(
    <PrecinctScannerTallyQrCode
      reportSavedTime={time}
      electionDefinition={electionSampleDefinition}
      reportPurpose="Testing"
      isPollsOpen={false}
      isLiveMode={false} // change from live to test
      compressedTally={compressedTally}
      signingMachineId="DEMO-0000"
    />
  );

  // ensure we've got both `sign` calls
  expect(mockKiosk.sign).toHaveBeenCalledTimes(2);

  expect(mockKiosk.sign).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      payload: expect.stringContaining(`DEMO-0000.1`),
    })
  );
  expect(mockKiosk.sign).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      payload: expect.stringContaining(`DEMO-0000.0`),
    })
  );

  // resolve the calls out of order
  act(() => {
    secondSignDeferred.resolve('SECONDFAKESIGNATURE');
    firstSignDeferred.resolve('FIRSTFAKESIGNATURE');
  });

  await waitFor(() => {
    expect(
      screen.queryByText('Automatic Election Results Reporting')
    ).toBeInTheDocument();
  });

  // ensure the we're correctly using the second signature and not the first,
  // despite the fact that the first one was resolved later
  const { value } = screen.getByTestId('qrcode').dataset;
  expect(value).toContain('SECONDFAKESIGNATURE');
});
