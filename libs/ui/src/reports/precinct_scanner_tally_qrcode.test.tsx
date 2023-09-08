import {
  electionGeneral,
  electionGeneralDefinition,
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
  election: electionGeneral,
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

    const compressedTally = compressTally(electionGeneral, resultsFixture);
    await getSignedQuickResultsReportingUrl({
      electionDefinition: electionGeneralDefinition,
      isLiveMode: true,
      compressedTally,
      signingMachineId: 'DEMO-0000',
    });

    const payloadComponents =
      mockKiosk.sign.mock.calls[0][0].payload.split('.');
    expect(payloadComponents).toEqual([
      electionGeneralDefinition.electionHash,
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

    const compressedTally = compressTally(electionGeneral, resultsFixture);
    await getSignedQuickResultsReportingUrl({
      electionDefinition: electionGeneralDefinition,
      isLiveMode: false,
      compressedTally,
      signingMachineId: 'DEMO-0000',
    });

    const payloadComponents =
      mockKiosk.sign.mock.calls[0][0].payload.split('.');
    expect(payloadComponents).toEqual([
      electionGeneralDefinition.electionHash,
      'DEMO-0000',
      '0', // test mode
      expect.any(String),
      expect.any(String),
    ]);
  });

  test('gives URL without signed component if no kiosk', async () => {
    const compressedTally = compressTally(electionGeneral, resultsFixture);
    const signed = await getSignedQuickResultsReportingUrl({
      electionDefinition: electionGeneralDefinition,
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
      election={electionGeneral}
      signedQuickResultsReportingUrl=""
    />
  );
  screen.getByText(/Polls closed/);
  screen.getByText('Automatic Election Results Reporting');
});
