import { throwIllegalValue } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { MAX_POSTGRES_INDEX_KEY_BYTES } from './globals.js';
import type { Jurisdiction, User } from './types.js';

/**
 * Our translation caches use the text as part of the primary key.
 * Ensure that the text fits within the byte limit for a Postgres primary key.
 */
export function isValidPrimaryKey(text: string): boolean {
  const textSizeInBytes = Buffer.byteLength(text, 'utf8');
  return textSizeInBytes < MAX_POSTGRES_INDEX_KEY_BYTES;
}

export function userBelongsToOrganization(
  user: User,
  organizationId: string
): boolean {
  return user.organization.id === organizationId;
}

export function userCanAccessJurisdiction(
  user: User,
  jurisdiction: Jurisdiction
): boolean {
  switch (user.type) {
    case 'jurisdiction_user':
      return user.jurisdictions.some((j) => j.id === jurisdiction.id);
    case 'organization_user': {
      return user.organization.id === jurisdiction.organization.id;
    }
    case 'support_user':
      return true;
    default: {
      throwIllegalValue(user);
    }
  }
}
