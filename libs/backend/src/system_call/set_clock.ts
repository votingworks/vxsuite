import { DateTime } from 'luxon';
import { execFile } from '../exec';
import { intermediateScript } from '../intermediate_scripts';

/**
 * Parameters for the `setClock` function.
 */
export interface SetClockParams {
  isoDatetime: string;
  ianaZone: string;
}

/**
 * Sets the system clock.
 */
export async function setClock({
  isoDatetime,
  ianaZone,
}: SetClockParams): Promise<void> {
  try {
    const datetimeString = DateTime.fromISO(isoDatetime, {
      zone: ianaZone,
    }).toFormat('yyyy-LL-dd TT');
    await execFile('sudo', [
      intermediateScript('set-clock'),
      ianaZone,
      datetimeString,
    ]);
  } catch (err) {
    const error = err as Error;
    if ('stderr' in error) {
      throw new Error((error as unknown as { stderr: string }).stderr);
    } else {
      throw error;
    }
  }
}
