import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ok } from '@votingworks/basics';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { renderHook, waitFor } from '../test/react_testing_library';
import {
  ApiClient,
  ApiClientContext,
  configureBallotPackageFromUsb,
  createApiClient,
  uiStringsApi,
  unconfigureMachine,
} from './api';

const queryClient = new QueryClient();
const mockBackendApi: ApiClient = {
  ...createApiClient(),
  configureBallotPackageFromUsb: jest.fn(),
  unconfigureMachine: jest.fn(),
};

function QueryWrapper(props: { children: React.ReactNode }) {
  const { children } = props;

  return (
    <ApiClientContext.Provider value={mockBackendApi}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiClientContext.Provider>
  );
}

const mockOnConfigurationChange = jest.spyOn(
  uiStringsApi,
  'onMachineConfigurationChange'
);

afterAll(() => {
  jest.restoreAllMocks();
});

test('configureBallotPackageFromUsb', async () => {
  jest
    .mocked(mockBackendApi)
    .configureBallotPackageFromUsb.mockResolvedValueOnce(
      ok(electionGeneralDefinition)
    );

  const { result } = renderHook(
    () => configureBallotPackageFromUsb.useMutation(),
    { wrapper: QueryWrapper }
  );

  expect(mockOnConfigurationChange).not.toHaveBeenCalled();

  result.current.mutate();
  await waitFor(() => expect(result.current.isSuccess).toEqual(true));

  expect(mockOnConfigurationChange).toHaveBeenCalled();
});

test('unconfigureMachine', async () => {
  jest.mocked(mockBackendApi).unconfigureMachine.mockResolvedValueOnce();

  const { result } = renderHook(() => unconfigureMachine.useMutation(), {
    wrapper: QueryWrapper,
  });

  expect(mockOnConfigurationChange).not.toHaveBeenCalled();

  result.current.mutate();
  await waitFor(() => expect(result.current.isSuccess).toEqual(true));

  expect(mockOnConfigurationChange).toHaveBeenCalled();
});
