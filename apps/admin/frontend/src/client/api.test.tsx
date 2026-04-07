import { afterEach, beforeEach, expect, test } from 'vitest';
import {
  mockPollWorkerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import {
  constructElectionKey,
  DEFAULT_SYSTEM_SETTINGS,
  DippedSmartCardAuth,
} from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { screen, waitFor } from '../../test/react_testing_library';
import {
  ClientApiMock,
  createClientApiMock,
} from '../../test/helpers/mock_client_api_client';
import { renderInClientContext } from '../../test/render_in_client_context';
import {
  getBallotAdjudicationData,
  getBallotImages,
  getMarginalMarks,
  getWriteInCandidates,
  getSystemSettings,
  adjudicateCvrContest,
  resolveBallotTags,
} from './api';

let apiMock: ClientApiMock;

const electionDefinition = readElectionGeneralDefinition();

beforeEach(() => {
  apiMock = createClientApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

const pollWorkerAuth: DippedSmartCardAuth.PollWorkerLoggedIn = {
  status: 'logged_in',
  user: mockPollWorkerUser({
    electionKey: constructElectionKey(electionDefinition.election),
  }),
  sessionExpiresAt: mockSessionExpiresAt(),
};

function TestQueryComponent({
  hookName,
  hookArgs,
}: {
  hookName: string;
  hookArgs?: unknown[];
}): JSX.Element {
  /* eslint-disable react-hooks/rules-of-hooks */
  let result: { data?: unknown; isSuccess: boolean; isLoading: boolean };
  switch (hookName) {
    case 'getBallotAdjudicationData':
      result = getBallotAdjudicationData.useQuery(
        (hookArgs?.[0] as string) ?? 'cvr-1'
      );
      break;
    case 'getBallotImages':
      result = getBallotImages.useQuery((hookArgs?.[0] as string) ?? 'cvr-1');
      break;
    case 'getMarginalMarks':
      result = getMarginalMarks.useQuery(
        (hookArgs?.[0] as string) ?? 'cvr-1',
        (hookArgs?.[1] as string) ?? 'contest-1'
      );
      break;
    case 'getWriteInCandidates':
      result = getWriteInCandidates.useQuery(hookArgs?.[0] as string);
      break;
    case 'getSystemSettings':
      result = getSystemSettings.useQuery();
      break;
    default:
      return <div>Unknown hook</div>;
  }
  /* eslint-enable react-hooks/rules-of-hooks */
  if (result.isLoading) return <div>Loading</div>;
  if (result.isSuccess) return <div>Data: {JSON.stringify(result.data)}</div>;
  return <div>Error</div>;
}

function renderHookTest(hookName: string, hookArgs?: unknown[]) {
  return renderInClientContext(
    <TestQueryComponent hookName={hookName} hookArgs={hookArgs} />,
    {
      auth: pollWorkerAuth,
      apiMock,
      electionDefinition,
    }
  );
}

test('getBallotAdjudicationData.useQuery calls API', async () => {
  apiMock.apiClient.getBallotAdjudicationData
    .expectCallWith({ cvrId: 'cvr-1' })
    // eslint-disable-next-line vx/gts-object-literal-types
    .resolves({ cvrId: 'cvr-1', contests: [] } as never);

  renderHookTest('getBallotAdjudicationData', ['cvr-1']);

  await waitFor(() => {
    expect(screen.getByText(/Data:/)).toBeDefined();
  });
});

test('getBallotImages.useQuery calls API', async () => {
  apiMock.apiClient.getBallotImages
    .expectCallWith({ cvrId: 'cvr-1' })
    // eslint-disable-next-line vx/gts-object-literal-types
    .resolves({ front: null, back: null } as never);

  renderHookTest('getBallotImages', ['cvr-1']);

  await waitFor(() => {
    expect(screen.getByText(/Data:/)).toBeDefined();
  });
});

test('getMarginalMarks.useQuery calls API', async () => {
  apiMock.apiClient.getMarginalMarks
    .expectCallWith({ cvrId: 'cvr-1', contestId: 'contest-1' })
    .resolves(['option-1']);

  renderHookTest('getMarginalMarks', ['cvr-1', 'contest-1']);

  await waitFor(() => {
    expect(screen.getByText(/Data:/)).toBeDefined();
  });
});

test('getWriteInCandidates.useQuery calls API', async () => {
  apiMock.apiClient.getWriteInCandidates
    .expectCallWith({ contestId: undefined })
    .resolves([]);

  renderHookTest('getWriteInCandidates');

  await waitFor(() => {
    expect(screen.getByText(/Data:/)).toBeDefined();
  });
});

test('getSystemSettings.useQuery calls API', async () => {
  apiMock.apiClient.getSystemSettings
    .expectCallWith()
    .resolves(DEFAULT_SYSTEM_SETTINGS);

  renderHookTest('getSystemSettings');

  await waitFor(() => {
    expect(screen.getByText(/Data:/)).toBeDefined();
  });
});

function MutationTestComponent({
  hookName,
}: {
  hookName: string;
}): JSX.Element {
  /* eslint-disable react-hooks/rules-of-hooks */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mutation: { mutateAsync: (input: any) => Promise<any> };
  switch (hookName) {
    case 'adjudicateCvrContest':
      mutation = adjudicateCvrContest.useMutation();
      break;
    case 'resolveBallotTags':
      mutation = resolveBallotTags.useMutation();
      break;
    default:
      return <div>Unknown mutation</div>;
  }
  /* eslint-enable react-hooks/rules-of-hooks */
  return (
    <button
      type="button"
      onClick={() => {
        void mutation.mutateAsync(
          hookName === 'adjudicateCvrContest'
            ? {
                cvrId: 'cvr-1',
                contestId: 'c-1',
                side: 'front',
                adjudicatedContestOptionById: {},
              }
            : { cvrId: 'cvr-1' }
        );
      }}
    >
      Mutate
    </button>
  );
}

test('adjudicateCvrContest.useMutation calls API', async () => {
  apiMock.apiClient.adjudicateCvrContest
    .expectCallWith({
      cvrId: 'cvr-1',
      contestId: 'c-1',
      side: 'front',
      adjudicatedContestOptionById: {},
    })
    .resolves();

  renderInClientContext(
    <MutationTestComponent hookName="adjudicateCvrContest" />,
    {
      auth: pollWorkerAuth,
      apiMock,
      electionDefinition,
    }
  );

  screen.getByText('Mutate').click();

  await waitFor(() => {
    expect(apiMock.apiClient.adjudicateCvrContest).toBeDefined();
  });
});

test('resolveBallotTags.useMutation calls API', async () => {
  apiMock.apiClient.resolveBallotTags
    .expectCallWith({ cvrId: 'cvr-1' })
    .resolves();

  renderInClientContext(
    <MutationTestComponent hookName="resolveBallotTags" />,
    {
      auth: pollWorkerAuth,
      apiMock,
      electionDefinition,
    }
  );

  screen.getByText('Mutate').click();

  await waitFor(() => {
    expect(apiMock.apiClient.resolveBallotTags).toBeDefined();
  });
});
