import { ok } from '@votingworks/basics';
import { mocks } from '@votingworks/custom-scanner';
import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import {
  configureApp,
  expectStatus,
  waitForStatus,
} from '../../../test/helpers/shared_helpers';
import { ballotImages, withApp } from '../../../test/helpers/custom_helpers';
import { SheetInterpretation } from '../../types';

jest.setTimeout(20_000);
jest.mock('@votingworks/ballot-encoder', () => {
  return {
    ...jest.requireActual('@votingworks/ballot-encoder'),
    // to allow changing election definitions without changing the image fixtures
    // TODO: generate image fixtures from election definitions more easily
    // this election hash is for the famous names image fixtures
    sliceElectionHash: () => 'da81438d51136692b43c',
  };
});

test('bmd ballot is rejected when scanned for wrong precinct', async () => {
  await withApp({}, async ({ apiClient, mockScanner, mockUsb, mockAuth }) => {
    // Ballot should be rejected when configured for the wrong precinct
    await configureApp(apiClient, mockUsb, { precinctId: '22', mockAuth });

    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
    await waitForStatus(apiClient, { state: 'ready_to_scan' });

    const interpretation: SheetInterpretation = {
      type: 'InvalidSheet',
      reason: 'invalid_precinct',
    };

    mockScanner.scan.mockResolvedValue(ok(await ballotImages.completeBmd()));
    await apiClient.scanBallot();
    await expectStatus(apiClient, { state: 'scanning' });
    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
    await waitForStatus(apiClient, {
      state: 'rejecting',
      interpretation,
    });
    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
    await waitForStatus(apiClient, {
      state: 'rejected',
      interpretation,
    });

    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
    await waitForStatus(apiClient, { state: 'no_paper' });
  });
});

test('bmd ballot is accepted if precinct is set for the right precinct', async () => {
  await withApp({}, async ({ apiClient, mockScanner, mockUsb, mockAuth }) => {
    // Configure for the proper precinct and verify the ballot scans
    await configureApp(apiClient, mockUsb, { precinctId: '23', mockAuth });

    const validInterpretation: SheetInterpretation = {
      type: 'ValidSheet',
    };

    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
    await waitForStatus(apiClient, { state: 'ready_to_scan' });

    mockScanner.scan.mockResolvedValue(ok(await ballotImages.completeBmd()));
    await apiClient.scanBallot();
    await expectStatus(apiClient, { state: 'scanning' });
    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
    await waitForStatus(apiClient, {
      state: 'ready_to_accept',
      interpretation: validInterpretation,
    });
  });
});

test('hmpb ballot is rejected when scanned for wrong precinct', async () => {
  await withApp({}, async ({ apiClient, mockScanner, mockUsb, mockAuth }) => {
    // Ballot should be rejected when configured for the wrong precinct
    await configureApp(apiClient, mockUsb, {
      ballotPackage:
        electionGridLayoutNewHampshireAmherstFixtures.electionJson.toBallotPackage(),
      precinctId: '22',
      mockAuth,
    });

    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
    await waitForStatus(apiClient, { state: 'ready_to_scan' });

    const interpretation: SheetInterpretation = {
      type: 'InvalidSheet',
      reason: 'invalid_precinct',
    };

    mockScanner.scan.mockResolvedValue(ok(await ballotImages.completeHmpb()));
    await apiClient.scanBallot();
    await expectStatus(apiClient, { state: 'scanning' });
    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
    await waitForStatus(apiClient, {
      state: 'rejecting',
      interpretation,
    });
    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
    await waitForStatus(apiClient, {
      state: 'rejected',
      interpretation,
    });

    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
    await waitForStatus(apiClient, { state: 'no_paper' });
  });
});

test('hmpb ballot is accepted if precinct is set for the right precinct', async () => {
  await withApp({}, async ({ apiClient, mockScanner, mockUsb, mockAuth }) => {
    // Configure for the proper precinct and verify the ballot scans
    await configureApp(apiClient, mockUsb, {
      ballotPackage:
        electionGridLayoutNewHampshireAmherstFixtures.electionJson.toBallotPackage(),
      precinctId: 'town-id-00701-precinct-id-',
      mockAuth,
    });

    const validInterpretation: SheetInterpretation = {
      type: 'ValidSheet',
    };

    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
    await waitForStatus(apiClient, { state: 'ready_to_scan' });

    mockScanner.scan.mockResolvedValue(ok(await ballotImages.completeHmpb()));
    await apiClient.scanBallot();
    await expectStatus(apiClient, { state: 'scanning' });
    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
    await waitForStatus(apiClient, {
      state: 'ready_to_accept',
      interpretation: validInterpretation,
    });
  });
});
