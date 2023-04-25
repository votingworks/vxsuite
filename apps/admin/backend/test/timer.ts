import { Timer, time } from '@votingworks/utils';
import { enable as enableDebugger, disable as disableDebugger } from 'debug';
import { rootDebug } from '../src/util/debug';

export function getPerformanceTimer(): Timer {
  const performanceTimer = time(rootDebug, '');
  enableDebugger('admin-backend:perf*');
  return {
    checkpoint: performanceTimer.checkpoint,
    end: () => {
      const duration = performanceTimer.end();
      disableDebugger();
      return duration;
    },
  };
}
