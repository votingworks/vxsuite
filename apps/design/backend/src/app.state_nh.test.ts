import { assert, assertDefined, err } from '@votingworks/basics';
import {
  electionPrimaryPrecinctSplitsFixtures,
  electionFamousNames2021Fixtures,
  electionGeneralFixtures,
} from '@votingworks/fixtures';
import {
  Election,
  ElectionId,
  hasSplits,
  PrecinctWithSplits,
  LanguageCode,
  BallotType,
  Precinct,
  PrecinctWithoutSplits,
  ContestSectionHeaders,
  ContestTypes,
  YesNoContest,
} from '@votingworks/types';
import { ballotStyleHasPrecinctOrSplit } from '@votingworks/utils';
import { readFileSync } from 'node:fs';
import { vi, test, expect, afterAll } from 'vitest';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import {
  organizations,
  jurisdictions,
  users,
  nonVxUser,
  nhJurisdiction,
} from '../test/mocks';
import { testSetupHelpers } from '../test/helpers';

const nhUser = nonVxUser;
const signatureSvg = readFileSync('./test/mockSignature.svg').toString();

vi.setConfig({ testTimeout: 30_000 });

const { setupApp, cleanup } = testSetupHelpers();

afterAll(cleanup);

test('getBallotPreviewPdf returns a ballot pdf for NH election with split precincts and additional config options', async () => {
  const baseElectionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  const election: Election = {
    ...baseElectionDefinition.election,
    state: 'New Hampshire',
    signature: {
      caption: 'Caption To Be Overwritten',
      image: 'Image To Be Overwritten',
    },
  };
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nhUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nhJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: JSON.stringify(election),
      },
    })
  ).unsafeUnwrap();
  const ballotStyles = await apiClient.listBallotStyles({ electionId });
  const precincts = await apiClient.listPrecincts({ electionId });

  const splitPrecinctIndex = precincts.findIndex((p) => hasSplits(p));
  assert(splitPrecinctIndex >= 0);
  const precinct = precincts[splitPrecinctIndex] as PrecinctWithSplits;
  const split = precinct.splits[0];
  split.clerkSignatureCaption = 'Test Clerk Caption';
  split.clerkSignatureImage = signatureSvg;
  split.electionTitleOverride = 'Test Election Title Override';

  (
    await apiClient.updatePrecinct({ electionId, updatedPrecinct: precinct })
  ).unsafeUnwrap();

  const ballotStyle = assertDefined(
    ballotStyles.find(
      (style) =>
        ballotStyleHasPrecinctOrSplit(style, { precinct, split }) &&
        style.languages!.includes(LanguageCode.ENGLISH)
    )
  );

  const result = (
    await apiClient.getBallotPreviewPdf({
      electionId,
      precinctId: precinct.id,
      ballotStyleId: ballotStyle.id,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
    })
  ).unsafeUnwrap();

  await expect(result.pdfData).toMatchPdfSnapshot({ failureThreshold: 0.001 });
});

test('getBallotPreviewPdf returns a ballot pdf for nh precinct with no split', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const election: Election = {
    ...baseElectionDefinition.election,
    state: 'New Hampshire',
    signature: {
      image: signatureSvg,
      caption: 'Test Image Caption',
    },
  };
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nhUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nhJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: JSON.stringify(election),
      },
    })
  ).unsafeUnwrap();
  const ballotStyles = await apiClient.listBallotStyles({ electionId });
  const precincts = await apiClient.listPrecincts({ electionId });

  function hasDistrictIds(
    precinct: Precinct
  ): precinct is PrecinctWithoutSplits {
    return 'districtIds' in precinct && precinct.districtIds.length > 0;
  }

  const precinct = assertDefined(precincts.find((p) => hasDistrictIds(p)));

  const result = (
    await apiClient.getBallotPreviewPdf({
      electionId,
      precinctId: precinct.id,
      ballotStyleId: assertDefined(
        ballotStyles.find(
          (style) =>
            style.districts.includes(precinct.districtIds[0]) &&
            style.languages!.includes(LanguageCode.ENGLISH)
        )
      ).id,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
    })
  ).unsafeUnwrap();

  await expect(result.pdfData).toMatchPdfSnapshot({ failureThreshold: 0.001 });
});

test.each<{
  description: string;
  ballotMeasureDescription: string;
  isRenderSuccessful: boolean;
}>([
  {
    description: 'Many short paragraphs',
    ballotMeasureDescription: '<p>Text</p>'.repeat(50),
    isRenderSuccessful: true,
  },
  {
    description: 'One long paragraph',
    ballotMeasureDescription: `<p>${'Text '.repeat(10000)}</p>`,
    isRenderSuccessful: false,
  },
  {
    description: 'One short paragraph followed by one long paragraph',
    ballotMeasureDescription: `<p>Text</p><p>${'Text '.repeat(10000)}</p>`,
    isRenderSuccessful: false,
  },
])(
  'splitting long ballot measures across pages when using NH template - $description',
  async ({ ballotMeasureDescription, isRenderSuccessful }) => {
    const baseElectionDefinition =
      electionFamousNames2021Fixtures.readElectionDefinition();
    const election: Election = {
      ...baseElectionDefinition.election,
      contests: [
        ...baseElectionDefinition.election.contests,
        {
          id: 'long-ballot-measure',
          type: 'yesno',
          title: 'Long Ballot Measure',
          description: ballotMeasureDescription,
          yesOption: { id: 'yes-option', label: 'Yes' },
          noOption: { id: 'no-option', label: 'No' },
          districtId: baseElectionDefinition.election.districts[0].id,
        },
      ],
      signature: {
        image: signatureSvg,
        caption: 'Caption',
      },
    };
    const { apiClient, auth0 } = await setupApp({
      organizations,
      jurisdictions,
      users,
    });

    auth0.setLoggedInUser(nhUser);
    const electionId = (
      await apiClient.loadElection({
        newId: 'new-election-id' as ElectionId,
        jurisdictionId: nhJurisdiction.id,
        upload: {
          format: 'vxf',
          electionFileContents: JSON.stringify(election),
        },
      })
    ).unsafeUnwrap();

    // IDs are updated after loading into VxDesign so we can't refer to the original election
    // definition IDs
    const contests = await apiClient.listContests({ electionId });
    const precincts = await apiClient.listPrecincts({ electionId });
    const ballotStyles = await apiClient.listBallotStyles({ electionId });

    const contest = assertDefined(
      contests.find((c) => c.title === 'Long Ballot Measure')
    );
    const precinctId = assertDefined(
      precincts.find(
        (p) => 'districtIds' in p && p.districtIds.includes(contest.districtId)
      )
    ).id;
    const ballotStyleId = assertDefined(
      ballotStyles.find((bs) => bs.districts.includes(contest.districtId))
    ).id;

    const result = await apiClient.getBallotPreviewPdf({
      electionId,
      precinctId,
      ballotStyleId,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
    });

    if (isRenderSuccessful) {
      // eslint-disable-next-line vx/no-assert-result-predicates
      expect(result.isOk()).toEqual(true);
      const { pdfData } = result.unsafeUnwrap();
      await expect(pdfData).toMatchPdfSnapshot({ failureThreshold: 0.001 });
    } else {
      // eslint-disable-next-line vx/no-assert-result-predicates
      expect(result.isOk()).toEqual(false);
      expect(result).toEqual(
        err({
          error: 'contestTooLong',
          contest: expect.objectContaining({ id: contest.id }),
        })
      );
    }
  }
);

test('contest section headers', async () => {
  const baseElection = electionGeneralFixtures.readElection();
  const election: Election = {
    ...baseElection,
    signature: {
      image: signatureSvg,
      caption: 'Test Image Caption',
    },
  };

  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nhUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nhJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: JSON.stringify(election),
      },
    })
  ).unsafeUnwrap();

  expect(await apiClient.getContestSectionHeaders({ electionId })).toEqual({});

  const contestSectionHeaders: ContestSectionHeaders = {
    candidate: {
      title: 'Candidates Section',
      description: '<p>Description for candidates</p>',
    },
    yesno: {
      title: 'Ballot Measures Section',
      description: '<p>Description for ballot measures</p>',
    },
  };
  await apiClient.updateContestSectionHeader({
    electionId,
    contestType: 'candidate',
    updatedHeader: contestSectionHeaders.candidate,
  });
  expect(await apiClient.getContestSectionHeaders({ electionId })).toEqual({
    candidate: contestSectionHeaders.candidate,
  });
  await apiClient.updateContestSectionHeader({
    electionId,
    contestType: 'yesno',
    updatedHeader: contestSectionHeaders.yesno,
  });
  expect(await apiClient.getContestSectionHeaders({ electionId })).toEqual(
    contestSectionHeaders
  );

  await apiClient.updateContestSectionHeader({
    electionId,
    contestType: 'candidate',
    updatedHeader: undefined,
  });
  expect(await apiClient.getContestSectionHeaders({ electionId })).toEqual({
    yesno: contestSectionHeaders.yesno,
  });

  await apiClient.updateContestSectionHeader({
    electionId,
    contestType: 'candidate',
    updatedHeader: contestSectionHeaders.candidate,
  });
  expect(await apiClient.getContestSectionHeaders({ electionId })).toEqual(
    contestSectionHeaders
  );

  // Invalid headers are rejected
  await suppressingConsoleOutput(async () => {
    await expect(
      apiClient.updateContestSectionHeader({
        electionId,
        contestType: 'not-real-type' as unknown as ContestTypes,
        updatedHeader: {
          title: 'Valid Title',
          description: undefined,
        },
      })
    ).rejects.toThrow(/Invalid input/);
    await expect(
      apiClient.updateContestSectionHeader({
        electionId,
        contestType: 'candidate',
        updatedHeader: {
          title: '', // Invalid empty title
          description: undefined,
        },
      })
    ).rejects.toThrow(/Too small/);
  });

  // Headers are passed to ballot rendering
  // Temporarily disabled
  // const precincts = await apiClient.listPrecincts({ electionId });
  // const ballotStyles = await apiClient.listBallotStyles({ electionId });
  // const precinct = precincts[0];
  // const ballotStyle = find(ballotStyles, (bs) =>
  //   bs.districts.some(
  //     (districtId) =>
  //       !hasSplits(precinct) && precinct.districtIds.includes(districtId)
  //   )
  // );

  // const result = (
  //   await apiClient.getBallotPreviewPdf({
  //     electionId,
  //     precinctId: precinct.id,
  //     ballotStyleId: assertDefined(ballotStyle).id,
  //     ballotType: BallotType.Precinct,
  //     ballotMode: 'test',
  //   })
  // ).unsafeUnwrap();
  // await expect(result.pdfData).toMatchPdfSnapshot({ failureThreshold: 0.001 });
});

test('ballot measure contest editing with additional contest options', async () => {
  const election = electionGeneralFixtures.readElection();
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nhUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nhJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: JSON.stringify(election),
      },
    })
  ).unsafeUnwrap();

  const contests = await apiClient.listContests({ electionId });
  const ballotMeasureContest = find(
    contests,
    (contest) => contest.type === 'yesno'
  );
  expect(ballotMeasureContest.additionalOptions).toBeUndefined();

  const expectedContest: YesNoContest = {
    ...ballotMeasureContest,
    additionalOptions: [
      {
        id: 'additional-option-1',
        label: 'Additional Option 1',
      },
      {
        id: 'additional-option-2',
        label: 'Additional Option 2',
      },
    ],
  };
  (
    await apiClient.updateContest({
      electionId,
      updatedContest: expectedContest,
    })
  ).unsafeUnwrap();
  const updatedContests = await apiClient.listContests({ electionId });
  const updatedContest = find(
    updatedContests,
    (contest): contest is YesNoContest => contest.id === ballotMeasureContest.id
  );
  expect(updatedContest.additionalOptions).toEqual(
    expectedContest.additionalOptions
  );
});
