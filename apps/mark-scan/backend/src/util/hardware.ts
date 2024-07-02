import { execFile } from '@votingworks/backend';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { BmdModelNumber } from '../types';

export function getMarkScanBmdModel(): BmdModelNumber {
  return isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.MARK_SCAN_USE_BMD_150
  )
    ? 'bmd-150'
    : 'bmd-155';
}

export async function isAccessibleControllerDaemonRunning(): Promise<boolean> {
  try {
    await execFile('exec ps aux | grep controller[d]');
    return true;
  } catch {
    return false;
  }
}
