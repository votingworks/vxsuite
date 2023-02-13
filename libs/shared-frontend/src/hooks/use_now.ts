import { DateTime } from 'luxon';
import { useState } from 'react';
import useInterval from 'use-interval';

/**
 * React hook to get a current-to-the-second date.
 */
export function useNow(): DateTime {
  const [now, setNow] = useState(DateTime.local());

  useInterval(() => {
    setNow(DateTime.local());
  }, 1000);

  return now;
}
