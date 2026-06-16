import { afterAll, expect, test, vi } from 'vitest';
import { find } from '@votingworks/basics';
import { electionGeneralFixtures } from '@votingworks/fixtures';
import { readElectionPackageFromBuffer } from '@votingworks/backend';
import { BallotType } from '@votingworks/types';
import {
  exportElectionPackage,
  getExportedFile,
  testSetupHelpers,
} from '../test/helpers';
import {
  jurisdictions,
  miJurisdiction,
  organizations,
  users,
} from '../test/mocks';
import { JurisdictionUser } from './types';

vi.setConfig({ testTimeout: 30_000 });

const { setupApp, cleanup } = testSetupHelpers();

afterAll(cleanup);

const miUser: JurisdictionUser = {
  type: 'jurisdiction_user',
  name: 'mi.user@example.com',
  id: 'auth0|mi-user-id',
  organization: miJurisdiction.organization,
  jurisdictions: [miJurisdiction],
};

test('general elections include generated straight party contest', async () => {
  const election = electionGeneralFixtures.readElection();
  const { apiClient, auth0, workspace, fileStorageClient } = await setupApp({
    organizations,
    jurisdictions,
    users: [...users, miUser],
  });
  auth0.setLoggedInUser(miUser);

  const electionId = (
    await apiClient.loadElection({
      newId: 'mi-election-id',
      jurisdictionId: miJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: JSON.stringify(election),
      },
    })
  ).unsafeUnwrap();

  const contests = await apiClient.listContests({ electionId });
  expect(
    contests.filter((contest) => contest.type === 'straight-party').length
  ).toEqual(1);
  const straightPartyContest = find(
    contests,
    (contest) => contest.type === 'straight-party'
  );
  const parties = await apiClient.listParties({ electionId });
  expect(straightPartyContest).toMatchObject({
    id: `${electionId}-straight-party-contest`,
    type: 'straight-party',
    title: 'Straight Party Ticket',
    optionIds: parties.map((party) => party.id),
  });
  const ballotStyles = await apiClient.listBallotStyles({ electionId });
  for (const ballotStyle of ballotStyles) {
    expect(ballotStyle.districts).toContain(straightPartyContest.districtId);
  }

  const exportMeta = await exportElectionPackage({
    apiClient,
    workspace,
    fileStorageClient,
    electionId,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: false,
    shouldExportTestBallots: false,
    numAuditIdBallots: undefined,
  });
  const electionPackageContents = getExportedFile({
    storage: fileStorageClient,
    jurisdictionId: miJurisdiction.id,
    url: exportMeta.electionPackageUrl,
  });
  const { electionPackage } = (
    await readElectionPackageFromBuffer(electionPackageContents)
  ).unsafeUnwrap();
  expect(
    electionPackage.electionDefinition.election.contests.some(
      (contest) => contest.type === 'straight-party'
    )
  ).toEqual(true);

  const ballotStyle = ballotStyles[0];
  const result = (
    await apiClient.getBallotPreviewPdf({
      electionId,
      precinctId: ballotStyle.precincts[0],
      ballotStyleId: ballotStyle.id,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
    })
  ).unsafeUnwrap();
  await expect(result.pdfData).toMatchPdfSnapshot({ failureThreshold: 0.001 });

  // Make sure re-ordering other contests works, even though straight party
  // contest is not in the db
  const realContests = contests.filter(
    (contest) => contest.type !== 'straight-party'
  );
  const reorderedRealContests = realContests.toReversed();
  await apiClient.reorderContests({
    electionId,
    contestIds: [
      straightPartyContest.id,
      ...reorderedRealContests.map((contest) => contest.id),
    ],
  });
  expect(await apiClient.listContests({ electionId })).toEqual([
    straightPartyContest,
    ...reorderedRealContests,
  ]);
});
