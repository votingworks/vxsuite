import { afterAll, expect, test, vi } from 'vitest';
import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { ok } from '@votingworks/basics';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { renderHook } from '../test/react_testing_library.js';
import {
  type ApiClient,
  configureElectionPackageFromUsb,
  createApiClient,
  getBarcodeActivationMode,
  getElectionRecord,
  getElectionState,
  getSystemSettings,
  uiStringsApi,
  unconfigureMachine,
} from './api.js';
import { ApiProvider } from './api_provider.js';

const queryClient = new QueryClient();
const mockBackendApi: ApiClient = {
  ...createApiClient(),
  configureElectionPackageFromUsb: vi.fn(),
  unconfigureMachine: vi.fn(),
  printBlankBallot: vi.fn(),
};

function QueryWrapper(props: { children: React.ReactNode }) {
  const { children } = props;

  return (
    <ApiProvider queryClient={queryClient} apiClient={mockBackendApi} noAudio>
      {children}
    </ApiProvider>
  );
}

const mockOnConfigurationChange = vi.spyOn(
  uiStringsApi,
  'onMachineConfigurationChange'
);

afterAll(() => {
  vi.restoreAllMocks();
});

test('configureElectionPackageFromUsb', async () => {
  vi.mocked(
    mockBackendApi
  ).configureElectionPackageFromUsb.mockResolvedValueOnce(
    ok(readElectionGeneralDefinition())
  );

  const { result } = renderHook(
    () => configureElectionPackageFromUsb.useMutation(),
    { wrapper: QueryWrapper }
  );

  expect(mockOnConfigurationChange).not.toHaveBeenCalled();

  result.current.mutate();
  await vi.waitFor(() => expect(result.current.isSuccess).toEqual(true));

  expect(mockOnConfigurationChange).toHaveBeenCalled();
});

test('unconfigureMachine resets all cached query data', async () => {
  vi.mocked(mockBackendApi).unconfigureMachine.mockResolvedValueOnce();
  const electionDefinition = readElectionGeneralDefinition();
  const cachedQueries: Array<[QueryKey, unknown]> = [
    [getBarcodeActivationMode.queryKey(), 'ballot_printing'],
    [getElectionRecord.queryKey(), { electionDefinition }],
    [getSystemSettings.queryKey(), DEFAULT_SYSTEM_SETTINGS],
    [getElectionState.queryKey(), { pollsState: 'polls_open' }],
    [uiStringsApi.getAvailableLanguages.getQueryKey(), ['en', 'es-US']],
  ];
  for (const [queryKey, data] of cachedQueries) {
    queryClient.setQueryData(queryKey, data);
  }

  const { result } = renderHook(() => unconfigureMachine.useMutation(), {
    wrapper: QueryWrapper,
  });

  result.current.mutate();
  await vi.waitFor(() => expect(result.current.isSuccess).toEqual(true));

  for (const [queryKey] of cachedQueries) {
    expect(queryClient.getQueryData(queryKey)).toBeUndefined();
  }
});
