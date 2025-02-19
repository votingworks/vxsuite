import { afterAll, expect, test, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { ok } from '@votingworks/basics';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { renderHook } from '../test/react_testing_library';
import {
  ApiClient,
  configureElectionPackageFromUsb,
  createApiClient,
  uiStringsApi,
  unconfigureMachine,
} from './api';
import { ApiProvider } from './api_provider';

const queryClient = new QueryClient();
const mockBackendApi: ApiClient = {
  ...createApiClient(),
  configureElectionPackageFromUsb: vi.fn(),
  unconfigureMachine: vi.fn(),
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

test('unconfigureMachine', async () => {
  vi.mocked(mockBackendApi).unconfigureMachine.mockResolvedValueOnce();

  const { result } = renderHook(() => unconfigureMachine.useMutation(), {
    wrapper: QueryWrapper,
  });

  expect(mockOnConfigurationChange).not.toHaveBeenCalled();

  result.current.mutate();
  await vi.waitFor(() => expect(result.current.isSuccess).toEqual(true));

  expect(mockOnConfigurationChange).toHaveBeenCalled();
});
