import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ElectionRecord } from '@votingworks/design-backend';
import {
  createMockApiClient,
  MockApiClient,
  nonVxUser,
  provideApi,
  vxUser,
} from '../test/api_helpers';
import { generalElectionRecord } from '../test/fixtures';
import { renderHook, waitFor } from '../test/react_testing_library';
import {
  electionFeatureConfigs,
  useElectionFeatures,
  userFeatureConfigs,
  useUserFeatures,
} from './features_context';

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('returns VX feature set for VX election', async () => {
  const vxElection = generalElectionRecord(vxUser.orgId);
  apiMock.getUser.expectRepeatedCallsWith().resolves(vxUser);
  apiMock.getElection
    .expectRepeatedCallsWith({
      user: vxUser,
      electionId: vxElection.election.id,
    })
    .resolves(vxElection);
  const userHook = renderHook(() => useUserFeatures(), {
    wrapper: ({ children }) =>
      provideApi(apiMock, children, vxElection.election.id),
  });
  await vi.waitFor(() => {
    expect(userHook.result.current).toEqual(userFeatureConfigs.vx);
  });

  const electionHook = renderHook(() => useElectionFeatures(), {
    wrapper: ({ children }) =>
      provideApi(apiMock, children, vxElection.election.id),
  });
  await vi.waitFor(() => {
    expect(electionHook.result.current).toEqual(electionFeatureConfigs.vx);
  });
});

test('returns NH feature set for NH election', async () => {
  const electionRecord = generalElectionRecord(nonVxUser.orgId);
  const nhElection: ElectionRecord = {
    ...electionRecord,
    election: { ...electionRecord.election, state: 'NH' },
  };
  const electionId = nhElection.election.id;
  apiMock.getUser.expectRepeatedCallsWith().resolves(nonVxUser);
  apiMock.getElection
    .expectRepeatedCallsWith({ user: nonVxUser, electionId })
    .resolves(nhElection);

  const userHook = renderHook(() => useUserFeatures(), {
    wrapper: ({ children }) => provideApi(apiMock, children, electionId),
  });
  await waitFor(() => {
    expect(userHook.result.current).toEqual(userFeatureConfigs.nh);
  });

  const electionHook = renderHook(() => useElectionFeatures(), {
    wrapper: ({ children }) => provideApi(apiMock, children, electionId),
  });
  await waitFor(() => {
    expect(electionHook.result.current).toEqual(electionFeatureConfigs.nh);
  });
});
