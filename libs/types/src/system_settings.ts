import { z } from 'zod';
import { Id, Iso8601Timestamp } from './generic';

/**
 * System settings as used by frontends. Several database fields are hidden from the app
 * because they are omitted in this model; see schema.sql.
 */
export interface SystemSettings {
  arePollWorkerCardPinsEnabled: boolean;
}

export const SystemSettingsSchema: z.ZodType<SystemSettings> = z.object({
  arePollWorkerCardPinsEnabled: z.boolean(),
});

/**
 * System settings as used by the db.
 */
export interface SystemSettingsDbRow {
  id: Id;
  created: Iso8601Timestamp;
  // sqlite3 does not support booleans
  arePollWorkerCardPinsEnabled: 0 | 1;
}
