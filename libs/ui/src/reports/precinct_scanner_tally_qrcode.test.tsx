import {
  electionSample,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { buildElectionResultsFixture, compressTally } from '@votingworks/utils';
import { fakeKiosk, mockOf } from '@votingworks/test-utils';
import { render, screen } from '../../test/react_testing_library';

import {
  getSignedQuickResultsReportingUrl,
  PrecinctScannerTallyQrCode,
} from './precinct_scanner_tally_qrcode';

afterEach(() => {
  window.kiosk = undefined;
});

const time = new Date(2021, 8, 19, 11, 5).getTime();

const resultsFixture = buildElectionResultsFixture({
  election: electionSample,
  cardCounts: {
    bmd: 1,
    hmpb: [],
  },
  includeGenericWriteIn: true,
  contestResultsSummaries: {
    'county-commisioners': {
      type: 'candidate',
      ballots: 1,
      officialOptionTallies: {
        argent: 1,
      },
    },
  },
});

describe('getSignedQuickResultsReportingUrl', () => {
  test('correctly formats signed url in live mode', async () => {
    const mockKiosk = fakeKiosk();
    mockOf(mockKiosk.sign).mockResolvedValue('FAKESIGNATURE');
    window.kiosk = mockKiosk;

    const compressedTally = compressTally(electionSample, resultsFixture);
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

    const compressedTally = compressTally(electionSample, resultsFixture);
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
    const compressedTally = compressTally(electionSample, resultsFixture);
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
