import { act, renderHook } from '@testing-library/react';
import { usePinEntry } from './use_pin_entry';
import { PinLength } from '../utils/pin_length';

test('defaults', () => {
  const pinEntry = renderHook(() =>
    usePinEntry({ pinLength: PinLength.exactly(6) })
  );

  expect(pinEntry.result.current).toEqual(
    expect.objectContaining({
      current: '',
      display: '- - - - - -',
    })
  );
});

test('PIN entry', () => {
  const pinEntry = renderHook(() =>
    usePinEntry({ pinLength: PinLength.exactly(6) })
  );

  act(() => {
    pinEntry.result.current.handleDigit(1);
  });
  act(() => {
    pinEntry.result.current.handleDigit(2);
  });
  act(() => {
    pinEntry.result.current.handleDigit(3);
  });
  act(() => {
    pinEntry.result.current.handleDigit(4);
  });
  act(() => {
    pinEntry.result.current.handleDigit(5);
  });
  act(() => {
    pinEntry.result.current.handleDigit(6);
  });

  expect(pinEntry.result.current).toEqual(
    expect.objectContaining({
      current: '123456',
      display: '• • • • • •',
    })
  );

  act(() => {
    pinEntry.result.current.handleBackspace();
  });

  expect(pinEntry.result.current).toEqual(
    expect.objectContaining({
      current: '12345',
      display: '• • • • • -',
    })
  );

  act(() => {
    pinEntry.result.current.reset();
  });

  expect(pinEntry.result.current).toEqual(
    expect.objectContaining({
      current: '',
      display: '- - - - - -',
    })
  );
});
