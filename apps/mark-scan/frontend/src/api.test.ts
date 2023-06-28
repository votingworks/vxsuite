import { renderHook } from '@testing-library/react-hooks';
import { useRpcApiClient } from './api';

test('useApiClient', () => {
  const { result } = renderHook(() => useRpcApiClient());
  expect(result.error && result.error.message).toEqual(
    'ApiClientContext.Provider not found'
  );
});
