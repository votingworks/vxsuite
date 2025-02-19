import { afterAll, expect, test, vi } from 'vitest';
import { ok } from '@votingworks/basics';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { renderHook, waitFor } from '../test/react_testing_library';
import {
  ApiClient,
  configureElectionPackageFromUsb,
  createApiClient,
  uiStringsApi,
} from './api';
import { ApiProvider } from './api_provider';

const mockBackendApi: ApiClient = {
  ...createApiClient(),
  configureElectionPackageFromUsb: vi.fn(),
  unconfigureMachine: vi.fn(),
};

function QueryWrapper(props: { children: React.ReactNode }) {
  const { children } = props;

  return (
    <ApiProvider apiClient={mockBackendApi} noAudio>
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
  await waitFor(() => expect(result.current.isSuccess).toEqual(true));

  expect(mockOnConfigurationChange).toHaveBeenCalled();
});
