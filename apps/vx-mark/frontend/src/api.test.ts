import { renderHook } from '@testing-library/react-hooks';
import { useApiClient } from './api';

test('useApiClient', () => {
  const { result } = renderHook(() => useApiClient());
  expect(result.error && result.error.message).toEqual(
    'ApiClientContext.Provider not found'
  );
});
