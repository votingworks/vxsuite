import { useInterval } from 'use-interval';

import * as api from '../api';

export function useAlarm(enableAlarm: boolean): void {
  const playSound = api.playSound.useMutation().mutate;
  useInterval(() => playSound({ name: 'alarm' }), enableAlarm ? 2000 : null);
}
