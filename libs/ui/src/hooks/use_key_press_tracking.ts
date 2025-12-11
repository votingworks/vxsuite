/* istanbul ignore file - @preserve */
import { useEffect, useState } from 'react';
import { DateTime } from 'luxon';

export interface KeyPressEvent {
  key: string;
  pressedAt: DateTime;
}

/**
 * Hook that tracks keyboard key presses and returns the last key pressed
 * with its timestamp. Useful for hardware testing to verify keyboard input.
 */
export function useKeyPressTracking(): KeyPressEvent | undefined {
  const [lastKeyPress, setLastKeyPress] = useState<KeyPressEvent>();

  useEffect(() => {
    function handleKeyboardEvent(e: KeyboardEvent) {
      setLastKeyPress({
        key: e.key === ' ' ? 'Space' : e.key,
        pressedAt: DateTime.now(),
      });
    }

    document.addEventListener('keydown', handleKeyboardEvent);
    return () => {
      document.removeEventListener('keydown', handleKeyboardEvent);
    };
  }, []);

  return lastKeyPress;
}
