import React from 'react';
import { render, screen } from '@testing-library/react';
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
} from '@votingworks/utils';
import { fakeKiosk, mockOf } from '@votingworks/test-utils';

import {
  getSignedQuickResultsReportingUrl,
  PrecinctScannerTallyQrCode,
} from './precinct_scanner_tally_qrcode';

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

describe('getSignedQuickResultsReportingUrl', () => {
  test('correctly formats signed url in live mode', async () => {
    const mockKiosk = fakeKiosk();
    mockOf(mockKiosk.sign).mockResolvedValue('FAKESIGNATURE');
    window.kiosk = mockKiosk;

    const tally = calculateTallyForCastVoteRecords(
      electionSample,
      new Set([cvr])
    );
    const compressedTally = compressTally(electionSample, tally);
    await getSignedQuickResultsReportingUrl({
      electionDefinition: electionSampleDefinition,
      isLiveMode: true,
      compressedTally,
      signingMachineId: 'DEMO-0000',
    });

    const payloadComponents =
      mockKiosk.sign.mock.calls[0][0].payload.split('.');
    expect(payloadComponents).toEqual([
      electionSampleDefinition.electionHash,
      'DEMO-0000',
      '1', // live mode
      expect.any(String),
      expect.any(String),
    ]);
  });

  test('correctly formats signed url in test mode', async () => {
    const mockKiosk = fakeKiosk();
    mockOf(mockKiosk.sign).mockResolvedValue('FAKESIGNATURE');
    window.kiosk = mockKiosk;

    const tally = calculateTallyForCastVoteRecords(
      electionSample,
      new Set([cvr])
    );
    const compressedTally = compressTally(electionSample, tally);
    await getSignedQuickResultsReportingUrl({
      electionDefinition: electionSampleDefinition,
      isLiveMode: false,
      compressedTally,
      signingMachineId: 'DEMO-0000',
    });

    const payloadComponents =
      mockKiosk.sign.mock.calls[0][0].payload.split('.');
    expect(payloadComponents).toEqual([
      electionSampleDefinition.electionHash,
      'DEMO-0000',
      '0', // test mode
      expect.any(String),
      expect.any(String),
    ]);
  });

  test('gives URL without signed component if no kiosk', async () => {
    const tally = calculateTallyForCastVoteRecords(
      electionSample,
      new Set([cvr])
    );
    const compressedTally = compressTally(electionSample, tally);
    const signed = await getSignedQuickResultsReportingUrl({
      electionDefinition: electionSampleDefinition,
      isLiveMode: false,
      compressedTally,
      signingMachineId: 'DEMO-0000',
    });
    expect(signed.endsWith('&s=')).toEqual(true);
  });
});

test('PrecinctScannerTallyQrCode', () => {
  render(
    <PrecinctScannerTallyQrCode
      pollsTransitionedTime={time}
      election={electionSample}
      signedQuickResultsReportingUrl=""
    />
  );
  screen.getByText(/Polls closed/);
  screen.getByText('Automatic Election Results Reporting');
});
