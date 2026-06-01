import { afterEach, beforeEach, expect, test } from 'vitest';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateWithoutTime } from '@votingworks/basics';
import { ElectionInfo } from '@votingworks/design-backend';
import {
  CandidateContest,
  Contests,
  District,
  DistrictContest,
  DistrictIdSchema,
  HmpbBallotPaperSize,
  unsafeParse,
  YesNoContest,
} from '@votingworks/types';

import {
  createMockApiClient,
  jurisdiction,
  MockApiClient,
  provideApi,
} from '../test/api_helpers';
import { electionInfoFromElection, makeElectionRecord } from '../test/fixtures';
import { render, screen, waitFor } from '../test/react_testing_library';
import {
  reorderContestsByDistrict,
  ReorderContestsByDistrictButton,
} from './reorder_contests_by_district_button';

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

function candidateContest(districtId: string, index: number): CandidateContest {
  return {
    id: `candidate-contest-${districtId}-${index}`,
    type: 'candidate',
    title: `Candidate Contest ${districtId} ${index}`,
    districtId,
    seats: 1,
    allowWriteIns: false,
    candidates: [],
  };
}

function yesNoContest(districtId: string, index: number): YesNoContest {
  return {
    id: `yesno-contest-${districtId}-${index}`,
    type: 'yesno',
    title: `Yes/No Contest ${districtId} ${index}`,
    districtId,
    description: 'A ballot measure',
    yesOption: { id: `yesno-contest-${districtId}-${index}-yes`, label: 'Yes' },
    noOption: { id: `yesno-contest-${districtId}-${index}-no`, label: 'No' },
  };
}

const testDistrictA: District = {
  id: unsafeParse(DistrictIdSchema, 'test-district-a'),
  name: 'District A',
};
const testDistrictB: District = {
  id: unsafeParse(DistrictIdSchema, 'test-district-b'),
  name: 'District B',
};
const testDistrictC: District = {
  id: unsafeParse(DistrictIdSchema, 'test-district-c'),
  name: 'District C',
};

const testDistricts = [testDistrictA, testDistrictB, testDistrictC];

const testContests: DistrictContest[] = [
  candidateContest(testDistrictA.id, 1),
  candidateContest(testDistrictB.id, 1),
  candidateContest(testDistrictC.id, 1),
  yesNoContest(testDistrictA.id, 1),
  yesNoContest(testDistrictB.id, 1),
  yesNoContest(testDistrictC.id, 1),
];

const testContestsInBcaOrder: DistrictContest[] = [
  candidateContest(testDistrictB.id, 1),
  candidateContest(testDistrictC.id, 1),
  candidateContest(testDistrictA.id, 1),
  yesNoContest(testDistrictB.id, 1),
  yesNoContest(testDistrictC.id, 1),
  yesNoContest(testDistrictA.id, 1),
];

const testElectionRecord = makeElectionRecord(
  {
    id: 'test-election-id',
    ballotLayout: {
      metadataEncoding: 'qr-code',
      paperSize: HmpbBallotPaperSize.Letter,
    },
    ballotStrings: {},
    ballotStyles: [],
    contests: testContests,
    county: { id: 'test-county', name: 'Test County' },
    date: DateWithoutTime.today(),
    districts: testDistricts,
    parties: [],
    precincts: [
      {
        id: 'test-precinct',
        name: 'Test Precinct',
        districtIds: testDistricts.map((d) => d.id),
      },
    ],
    seal: '',
    state: 'CA',
    title: 'Test Election',
    type: 'general',
  },
  jurisdiction.id
);

const testElection = testElectionRecord.election;
const testElectionId = testElection.id;
const testElectionInfo = electionInfoFromElection(testElection);

function renderButton() {
  return render(
    provideApi(
      apiMock,
      <ReorderContestsByDistrictButton electionId={testElectionId} />
    )
  );
}

test.each<{
  description: string;
  ballotsFinalizedAt: Date | null;
  electionInfo: ElectionInfo;
  contests: Contests;
  shouldButtonBeEnabled: boolean;
}>([
  {
    description: 'button enabled',
    ballotsFinalizedAt: null,
    electionInfo: testElectionInfo,
    contests: testElection.contests,
    shouldButtonBeEnabled: true,
  },
  {
    description: 'button disabled when ballots finalized',
    ballotsFinalizedAt: new Date(),
    electionInfo: testElectionInfo,
    contests: testElection.contests,
    shouldButtonBeEnabled: false,
  },
  {
    description: 'button disabled when election has external source',
    ballotsFinalizedAt: null,
    electionInfo: {
      ...testElectionInfo,
      externalSource: 'ms-sems',
    },
    contests: testElection.contests,
    shouldButtonBeEnabled: false,
  },
  {
    description: 'button disabled when no contests',
    ballotsFinalizedAt: null,
    electionInfo: testElectionInfo,
    contests: [],
    shouldButtonBeEnabled: false,
  },
])(
  'button enable/disable logic - $description',
  async ({
    ballotsFinalizedAt,
    electionInfo,
    contests,
    shouldButtonBeEnabled,
  }) => {
    apiMock.getBallotsFinalizedAt
      .expectCallWith({ electionId: testElectionId })
      .resolves(ballotsFinalizedAt);
    apiMock.getElectionInfo
      .expectCallWith({ electionId: testElectionId })
      .resolves(electionInfo);
    apiMock.listContests
      .expectCallWith({ electionId: testElectionId })
      .resolves(contests);
    apiMock.listDistricts
      .expectCallWith({ electionId: testElectionId })
      .resolves(testDistricts);

    renderButton();

    const button = await screen.findByRole('button', {
      name: 'Reorder Contests by District',
    });
    if (shouldButtonBeEnabled) {
      expect(button).toBeEnabled();
    } else {
      expect(button).toBeDisabled();
    }
  }
);

test('reorders districts and saves', async () => {
  apiMock.getBallotsFinalizedAt
    .expectCallWith({ electionId: testElectionId })
    .resolves(null);
  apiMock.getElectionInfo
    .expectCallWith({ electionId: testElectionId })
    .resolves(testElectionInfo);
  apiMock.listContests
    .expectCallWith({ electionId: testElectionId })
    .resolves(testContests);
  apiMock.listDistricts
    .expectCallWith({ electionId: testElectionId })
    .resolves(testDistricts);

  renderButton();

  userEvent.click(
    await screen.findByRole('button', { name: 'Reorder Contests by District' })
  );
  let modal = await screen.findByRole('alertdialog');

  userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(modal).not.toBeInTheDocument());

  userEvent.click(
    await screen.findByRole('button', { name: 'Reorder Contests by District' })
  );
  modal = await screen.findByRole('alertdialog');

  // Check that move up button is disabled for first district
  expect(
    within(modal).getByRole('button', {
      name: `Move Up: ${testDistrictA.name}`,
    })
  ).toBeDisabled();

  // Check that move down button is disabled for last district
  expect(
    within(modal).getByRole('button', {
      name: `Move Down: ${testDistrictC.name}`,
    })
  ).toBeDisabled();

  // Move District B up --> B, A, C
  userEvent.click(
    within(modal).getByRole('button', {
      name: `Move Up: ${testDistrictB.name}`,
    })
  );

  // Move District A down --> B, C, A
  userEvent.click(
    within(modal).getByRole('button', {
      name: `Move Down: ${testDistrictA.name}`,
    })
  );

  apiMock.reorderContests
    .expectCallWith({
      electionId: testElectionId,
      contestIds: testContestsInBcaOrder.map((contest) => contest.id),
    })
    .resolves();
  apiMock.getElectionInfo
    .expectCallWith({ electionId: testElectionId })
    .resolves(testElectionInfo);
  apiMock.listContests
    .expectCallWith({ electionId: testElectionId })
    .resolves(testContestsInBcaOrder);
  apiMock.listDistricts
    .expectCallWith({ electionId: testElectionId })
    .resolves(testDistricts);
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(modal).not.toBeInTheDocument());
});

test('initial district order is based on the order of appearance in contests', async () => {
  apiMock.getBallotsFinalizedAt
    .expectCallWith({ electionId: testElectionId })
    .resolves(null);
  apiMock.getElectionInfo
    .expectCallWith({ electionId: testElectionId })
    .resolves(testElectionInfo);
  apiMock.listContests
    .expectCallWith({ electionId: testElectionId })
    .resolves(testContestsInBcaOrder);
  apiMock.listDistricts
    .expectCallWith({ electionId: testElectionId })
    .resolves(testDistricts);

  renderButton();

  userEvent.click(
    await screen.findByRole('button', { name: 'Reorder Contests by District' })
  );
  const modal = await screen.findByRole('alertdialog');

  // Move Up should be disabled for District B (first in order)
  expect(
    within(modal).getByRole('button', {
      name: `Move Up: ${testDistrictB.name}`,
    })
  ).toBeDisabled();

  // Move Down should be disabled for District A (last in order)
  expect(
    within(modal).getByRole('button', {
      name: `Move Down: ${testDistrictA.name}`,
    })
  ).toBeDisabled();
});

test.each<{
  contests: DistrictContest[];
  districtOrder: District[];
  reorderedContests: DistrictContest[];
}>([
  {
    contests: [
      candidateContest(testDistrictA.id, 1),
      candidateContest(testDistrictB.id, 1),
      yesNoContest(testDistrictA.id, 1),
      yesNoContest(testDistrictB.id, 1),
    ],
    districtOrder: [testDistrictB, testDistrictA, testDistrictC],
    reorderedContests: [
      candidateContest(testDistrictB.id, 1),
      candidateContest(testDistrictA.id, 1),
      yesNoContest(testDistrictB.id, 1),
      yesNoContest(testDistrictA.id, 1),
    ],
  },
  {
    contests: [
      candidateContest(testDistrictA.id, 1),
      candidateContest(testDistrictA.id, 2),
      candidateContest(testDistrictB.id, 1),
      candidateContest(testDistrictA.id, 3),
      candidateContest(testDistrictA.id, 4),
      yesNoContest(testDistrictB.id, 1),
      yesNoContest(testDistrictA.id, 1),
      yesNoContest(testDistrictB.id, 2),
      yesNoContest(testDistrictB.id, 3),
      yesNoContest(testDistrictC.id, 1),
      yesNoContest(testDistrictB.id, 4),
      yesNoContest(testDistrictA.id, 2),
    ],
    districtOrder: [testDistrictA, testDistrictB, testDistrictC],
    reorderedContests: [
      candidateContest(testDistrictA.id, 1),
      candidateContest(testDistrictA.id, 2),
      candidateContest(testDistrictA.id, 3),
      candidateContest(testDistrictA.id, 4),
      candidateContest(testDistrictB.id, 1),
      yesNoContest(testDistrictA.id, 1),
      yesNoContest(testDistrictA.id, 2),
      yesNoContest(testDistrictB.id, 1),
      yesNoContest(testDistrictB.id, 2),
      yesNoContest(testDistrictB.id, 3),
      yesNoContest(testDistrictB.id, 4),
      yesNoContest(testDistrictC.id, 1),
    ],
  },
])(
  'reorderContestsByDistrict',
  ({ contests, districtOrder, reorderedContests }) => {
    expect(reorderContestsByDistrict(contests, districtOrder)).toEqual(
      reorderedContests
    );
  }
);
