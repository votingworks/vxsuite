import { ok } from '@votingworks/basics';
import { electionGeneralDefinition } from '@votingworks/fixtures';
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
  configureElectionPackageFromUsb: jest.fn(),
  unconfigureMachine: jest.fn(),
};

function QueryWrapper(props: { children: React.ReactNode }) {
  const { children } = props;

  return (
    <ApiProvider apiClient={mockBackendApi} noAudio>
      {children}
    </ApiProvider>
  );
}

const mockOnConfigurationChange = jest.spyOn(
  uiStringsApi,
  'onMachineConfigurationChange'
);

afterAll(() => {
  jest.restoreAllMocks();
});

test('configureElectionPackageFromUsb', async () => {
  jest
    .mocked(mockBackendApi)
    .configureElectionPackageFromUsb.mockResolvedValueOnce(
      ok(electionGeneralDefinition)
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
