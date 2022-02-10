import { unsafeParse } from '@votingworks/types';
import {
  ElectionRecord,
  ElectionRecordSchema,
} from '@votingworks/types/api/services/scan';

export async function getConfig(): Promise<ElectionRecord | undefined> {
  const response = await fetch('/config');

  if (!response.ok) {
    return undefined;
  }

  const config = await response.json();
  return unsafeParse(ElectionRecordSchema, config);
}
