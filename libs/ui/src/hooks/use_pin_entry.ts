import React, { useCallback, useMemo, useState } from 'react';
import { PinLength } from '../utils/pin_length';

/**
 * Options for the {@link usePinEntry} hook.
 */
export interface UsePinEntryOptions {
  pinLength: PinLength;
}

/**
 * Returned by the {@link usePinEntry} hook.
 */
export interface PinEntry {
  current: string;
  display: string;
  setCurrent: React.Dispatch<React.SetStateAction<string>>;
  reset: () => string;
  handleDigit: (digit: number) => string;
  handleBackspace: () => string;
}

/**
 * A hook for managing PIN entry. The returned object contains the current PIN,
 * a display string for the PIN, and methods for updating the PIN.
 */
export function usePinEntry({ pinLength }: UsePinEntryOptions): PinEntry {
  const [current, setCurrent] = useState('');

  const reset = useCallback(() => {
    setCurrent('');
    return '';
  }, []);

  const handleDigit = useCallback(
    (digit: number) => {
      const pin = `${current}${digit}`.slice(0, pinLength.max);
      setCurrent(pin);
      return pin;
    },
    [current, pinLength.max]
  );

  const handleBackspace = useCallback(() => {
    const pin = current.slice(0, -1);
    setCurrent(pin);
    return pin;
  }, [current]);

  const display = '•'
    .repeat(current.length)
    .padEnd(pinLength.max, '-')
    .split('')
    .join(' ');

  return useMemo(
    () => ({
      current,
      display,
      setCurrent,
      reset,
      handleDigit,
      handleBackspace,
    }),
    [current, display, setCurrent, reset, handleDigit, handleBackspace]
  );
}
