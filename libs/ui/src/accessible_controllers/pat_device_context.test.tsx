import React from 'react';
import { act, renderHook } from '../../test/react_testing_library';
import {
  PatDeviceContextProvider,
  useIsPatDeviceConnected,
} from './pat_device_context';

test('useIsPatDeviceConnected - exposes context value when present', () => {
  let setIsPatDeviceConnected: (isConnected: boolean) => void | undefined;

  function TestContext(props: { children: React.ReactNode }) {
    const patConnectionState = React.useState(false);
    const [isPatDeviceConnected] = patConnectionState;
    [, setIsPatDeviceConnected] = patConnectionState;

    return (
      <PatDeviceContextProvider
        {...props}
        isPatDeviceConnected={isPatDeviceConnected}
      />
    );
  }

  const { result } = renderHook(useIsPatDeviceConnected, {
    wrapper: TestContext,
  });

  act(() => setIsPatDeviceConnected!(true));
  expect(result.current).toEqual(true);

  act(() => setIsPatDeviceConnected!(false));
  expect(result.current).toEqual(false);
});

test('useIsPatDeviceConnected - defaults to false when no context is provided', () => {
  const { result } = renderHook(useIsPatDeviceConnected);
  expect(result.current).toEqual(false);
});
