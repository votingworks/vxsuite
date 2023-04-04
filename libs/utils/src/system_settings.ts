import { Result } from '@votingworks/basics';
import {
  safeParseJson,
  SystemSettings,
  SystemSettingsSchema,
} from '@votingworks/types';
import { z } from 'zod';

/**
 * Parses `value` as JSON `SystemSettings` or returns an error if input is malformed
 */
export function safeParseSystemSettings(
  value: string
): Result<SystemSettings, z.ZodError | SyntaxError> {
  return safeParseJson(value, SystemSettingsSchema);
}
