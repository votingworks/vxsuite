import type { SystemCallApi as SystemCallApiClient } from '@votingworks/backend';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ok } from '@votingworks/basics';
import {
  BATTERY_POLLING_INTERVAL_GROUT,
  createSystemCallApi,
  useSystemCallApi,
} from './system_call_api';

jest.useFakeTimers();

const queryClient = new QueryClient();
function QueryWrapper(props: { children: React.ReactNode }) {
  const { children } = props;

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockApiClient: jest.Mocked<SystemCallApiClient> = {
  rebootToVendorMenu: jest.fn(),
  powerDown: jest.fn(),
  setClock: jest.fn(),
  exportLogsToUsb: jest.fn(),
  getBatteryInfo: jest.fn(),
  getAudioInfo: jest.fn(),
};
const api = createSystemCallApi(() => mockApiClient);

describe('React Query API calls the right client methods', () => {
  beforeEach(() => {
    jest.resetAllMocks();
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
    (await mutation.current.mutateAsync({ format: 'vxf' })).unsafeUnwrap();
    expect(mockApiClient.exportLogsToUsb).toHaveBeenCalledTimes(1);
  });

  test('getBatteryInfo', async () => {
    mockApiClient.getBatteryInfo.mockResolvedValue({
      level: 0.5,
      discharging: true,
    });
    const { result: query } = renderHook(() => api.getBatteryInfo.useQuery(), {
      wrapper: QueryWrapper,
    });

    await waitFor(() => {
      expect(query.current.data).toEqual({
        level: 0.5,
        discharging: true,
      });
    });
    expect(mockApiClient.getBatteryInfo).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(BATTERY_POLLING_INTERVAL_GROUT);
    expect(mockApiClient.getBatteryInfo).toHaveBeenCalledTimes(2);
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
