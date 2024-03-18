import { execFile } from '@votingworks/backend';

export async function isAccessibleControllerDaemonRunning(): Promise<boolean> {
  try {
    await execFile('exec ps aux | grep controller[d]');
    return true;
  } catch {
    return false;
  }
}
