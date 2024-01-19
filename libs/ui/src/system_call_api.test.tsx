import type { SystemCallApi as SystemCallApiClient } from '@votingworks/backend';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ok } from '@votingworks/basics';
import { createSystemCallApi, useSystemCallApi } from './system_call_api';

const queryClient = new QueryClient();
function QueryWrapper(props: { children: React.ReactNode }) {
  const { children } = props;

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockApiClient: jest.Mocked<SystemCallApiClient> = {
  reboot: jest.fn(),
  rebootToBios: jest.fn(),
  powerDown: jest.fn(),
  setClock: jest.fn(),
  exportLogsToUsb: jest.fn(),
};
const api = createSystemCallApi(() => mockApiClient);

describe('React Query API calls the right client methods', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('reboot', async () => {
    const { result: mutation } = renderHook(() => api.reboot.useMutation(), {
      wrapper: QueryWrapper,
    });
    mockApiClient.reboot.mockResolvedValueOnce(undefined as never);
    await mutation.current.mutateAsync();
    expect(mockApiClient.reboot).toHaveBeenCalledTimes(1);
  });

  test('rebootToBios', async () => {
    const { result: mutation } = renderHook(
      () => api.rebootToBios.useMutation(),
      {
        wrapper: QueryWrapper,
      }
    );
    mockApiClient.rebootToBios.mockResolvedValueOnce(undefined as never);
    await mutation.current.mutateAsync();
    expect(mockApiClient.rebootToBios).toHaveBeenCalledTimes(1);
  });

  test('powerDown', async () => {
    const { result: mutation } = renderHook(() => api.powerDown.useMutation(), {
      wrapper: QueryWrapper,
    });
    mockApiClient.powerDown.mockResolvedValueOnce(undefined as never);
    await mutation.current.mutateAsync();
    expect(mockApiClient.powerDown).toHaveBeenCalledTimes(1);
  });

  test('setClock', async () => {
    const { result: mutation } = renderHook(() => api.setClock.useMutation(), {
      wrapper: QueryWrapper,
    });
    mockApiClient.setClock.mockResolvedValueOnce(undefined as never);
    await mutation.current.mutateAsync({
      isoDatetime: 'test',
      ianaZone: 'test',
    });
    expect(mockApiClient.setClock).toHaveBeenCalledTimes(1);
  });

  test('exportLogsToUsb', async () => {
    const { result: mutation } = renderHook(
      () => api.exportLogsToUsb.useMutation(),
      {
        wrapper: QueryWrapper,
      }
    );
    mockApiClient.exportLogsToUsb.mockResolvedValueOnce(ok());
    (await mutation.current.mutateAsync()).unsafeUnwrap();
    expect(mockApiClient.exportLogsToUsb).toHaveBeenCalledTimes(1);
  });
});

test('useSystemCallApi throws if not wrapped in SystemCallContextProvider', () => {
  renderHook(() => {
    try {
      useSystemCallApi();
    } catch (e) {
      expect((e as Error).message).toEqual(
        'the SystemCall API was not provided'
      );
    }
  });

  expect.assertions(1);
});
