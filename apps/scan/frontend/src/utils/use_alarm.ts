import { useEffect } from 'react';

import * as api from '../api';

export function useAlarm(enableAlarm: boolean): void {
  const playSound = api.playSound.useMutation().mutate;
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (enableAlarm) {
      interval = setInterval(() => playSound({ name: 'alarm' }), 2000);
    }
    return () => clearInterval(interval);
  }, [enableAlarm, playSound]);
}
