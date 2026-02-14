/* istanbul ignore file - @preserve */
import { useState } from 'react';
import { Button } from './button';

/**
 * A button that displays and increments a tap counter.
 * Useful for hardware testing to verify touch input.
 */
export function CounterButton(): JSX.Element {
  const [count, setCount] = useState(0);

  return (
    <Button onPress={() => setCount((prev) => prev + 1)}>
      Tap Count: {count}
    </Button>
  );
}
