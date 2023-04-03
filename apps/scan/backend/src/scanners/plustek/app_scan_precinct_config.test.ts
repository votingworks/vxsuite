import {
  configureApp,
  expectStatus,
  waitForStatus,
} from '../../../test/helpers/shared_helpers';
import { ballotImages, withApp } from '../../../test/helpers/plustek_helpers';
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
  await withApp({}, async ({ apiClient, mockPlustek, mockUsb, mockAuth }) => {
    await configureApp(apiClient, mockUsb, { precinctId: '22', mockAuth });
    // Ballot should be rejected when configured for the wrong precinct

    (
      await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
    ).unsafeUnwrap();
    await waitForStatus(apiClient, { state: 'ready_to_scan' });

    const interpretation: SheetInterpretation = {
      type: 'InvalidSheet',
      reason: 'invalid_precinct',
    };

    await apiClient.scanBallot();
    await expectStatus(apiClient, { state: 'scanning' });
    await waitForStatus(apiClient, {
      state: 'rejecting',
      interpretation,
    });
    await waitForStatus(apiClient, {
      state: 'rejected',
      interpretation,
    });

    (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
    await waitForStatus(apiClient, { state: 'no_paper' });
  });
});

test('bmd ballot is accepted if precinct is set for the right precinct', async () => {
  await withApp({}, async ({ apiClient, mockPlustek, mockUsb, mockAuth }) => {
    await configureApp(apiClient, mockUsb, { precinctId: '23', mockAuth });
    // Configure for the proper precinct and verify the ballot scans

    const validInterpretation: SheetInterpretation = {
      type: 'ValidSheet',
    };

    (
      await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
    ).unsafeUnwrap();
    await waitForStatus(apiClient, { state: 'ready_to_scan' });

    await apiClient.scanBallot();
    await expectStatus(apiClient, { state: 'scanning' });
    await waitForStatus(apiClient, {
      state: 'ready_to_accept',
      interpretation: validInterpretation,
    });
  });
});

test('hmpb ballot is rejected when scanned for wrong precinct', async () => {
  await withApp({}, async ({ apiClient, mockPlustek, mockUsb, mockAuth }) => {
    await configureApp(apiClient, mockUsb, {
      addTemplates: true,
      precinctId: '22',
      mockAuth,
    });
    // Ballot should be rejected when configured for the wrong precinct

    (
      await mockPlustek.simulateLoadSheet(ballotImages.completeHmpb)
    ).unsafeUnwrap();
    await waitForStatus(apiClient, { state: 'ready_to_scan' });

    const interpretation: SheetInterpretation = {
      type: 'InvalidSheet',
      reason: 'invalid_precinct',
    };

    await apiClient.scanBallot();
    await expectStatus(apiClient, { state: 'scanning' });
    await waitForStatus(apiClient, {
      state: 'rejecting',
      interpretation,
    });
    await waitForStatus(apiClient, {
      state: 'rejected',
      interpretation,
    });

    (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
    await waitForStatus(apiClient, { state: 'no_paper' });
  });
});

test('hmpb ballot is accepted if precinct is set for the right precinct', async () => {
  await withApp({}, async ({ apiClient, mockPlustek, mockUsb, mockAuth }) => {
    await configureApp(apiClient, mockUsb, {
      addTemplates: true,
      precinctId: '21',
      mockAuth,
    });
    // Configure for the proper precinct and verify the ballot scans

    const validInterpretation: SheetInterpretation = {
      type: 'ValidSheet',
    };

    (
      await mockPlustek.simulateLoadSheet(ballotImages.completeHmpb)
    ).unsafeUnwrap();
    await waitForStatus(apiClient, { state: 'ready_to_scan' });

    await apiClient.scanBallot();
    await expectStatus(apiClient, { state: 'scanning' });
    await waitForStatus(apiClient, {
      state: 'ready_to_accept',
      interpretation: validInterpretation,
    });
  });
});
