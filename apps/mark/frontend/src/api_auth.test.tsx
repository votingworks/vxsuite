import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QUERY_CLIENT_DEFAULT_OPTIONS } from '@votingworks/ui';
import { renderHook, waitFor } from '../test/react_testing_library';
import {
  ApiClient,
  ApiClientContext,
  createApiClient,
  updateCardlessVoterBallotStyle,
} from './api';

const queryClient = new QueryClient({
  defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS,
});
const mockBackendApi: ApiClient = {
  ...createApiClient(),
  updateCardlessVoterBallotStyle: jest.fn(),
};

function TestHookWrapper(props: { children: React.ReactNode }) {
  return (
    <ApiClientContext.Provider value={mockBackendApi}>
      <QueryClientProvider {...props} client={queryClient} />
    </ApiClientContext.Provider>
  );
}

test('updateCardlessVoterBallotStyle', async () => {
  jest
    .mocked(mockBackendApi)
    .updateCardlessVoterBallotStyle.mockResolvedValueOnce();

  const { result } = renderHook(
    () => updateCardlessVoterBallotStyle.useMutation(),
    { wrapper: TestHookWrapper }
  );

  expect(mockBackendApi.updateCardlessVoterBallotStyle).not.toHaveBeenCalled();

  result.current.mutate({ ballotStyleId: 'ballotStyle24' });
  await waitFor(() => expect(result.current.isSuccess).toEqual(true));

  expect(mockBackendApi.updateCardlessVoterBallotStyle).toHaveBeenCalledWith({
    ballotStyleId: 'ballotStyle24',
  });
});
