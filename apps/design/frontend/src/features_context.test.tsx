import { ElectionRecord } from '@votingworks/design-backend';
import {
  createMockApiClient,
  MockApiClient,
  provideApi,
} from '../test/api_helpers';
import { generalElectionRecord } from '../test/fixtures';
import { renderHook, waitFor } from '../test/react_testing_library';
import {
  DEFAULT_ENABLED_FEATURES,
  NH_ENABLED_FEATURES,
  useFeaturesContext,
} from './features_context';

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('returns default feature set if no election specified', () => {
  const { result } = renderHook(useFeaturesContext);
  expect(result.current).toEqual(DEFAULT_ENABLED_FEATURES);
});

test('returns NH feature set for NH election', async () => {
  const nhElection: ElectionRecord = {
    ...generalElectionRecord,
    election: { ...generalElectionRecord.election, state: 'NH' },
  };
  const electionId = nhElection.election.id;
  apiMock.getElection.expectCallWith({ electionId }).resolves(nhElection);

  const { result } = renderHook(() => useFeaturesContext(), {
    wrapper: ({ children }) => provideApi(apiMock, children, electionId),
  });
  await waitFor(() => {
    expect(result.current).toEqual(NH_ENABLED_FEATURES);
  });
});
