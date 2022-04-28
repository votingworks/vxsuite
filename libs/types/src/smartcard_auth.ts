import * as z from 'zod';
import { ElectionHash, IdSchema } from './generic';

export type UserRole = 'voter' | 'pollworker' | 'admin' | 'superadmin';
export const UserRoleSchema: z.ZodSchema<UserRole> = z.union([
  z.literal('voter'),
  z.literal('pollworker'),
  z.literal('admin'),
  z.literal('superadmin'),
]);
export interface CardData {
  readonly t: UserRole;
}
const CardDataInternalSchema = z.object({
  t: UserRoleSchema,
});
export const CardDataSchema: z.ZodSchema<CardData> = CardDataInternalSchema;

export interface VoterCardData extends CardData {
  readonly t: 'voter';
  /** Created date */
  readonly c: number;
  /** Ballot style ID */
  readonly bs: string;
  /** Precinct ID */
  readonly pr: string;
  /** Used (voided) */
  readonly uz?: number;
  /** Ballot printed date */
  readonly bp?: number;
  /** Updated date */
  readonly u?: number;
  /** Mark machine ID */
  readonly m?: string;
}
export const VoterCardDataSchema: z.ZodSchema<VoterCardData> =
  CardDataInternalSchema.extend({
    t: z.literal('voter'),
    c: z.number(),
    bs: IdSchema,
    pr: IdSchema,
    uz: z.number().optional(),
    bp: z.number().optional(),
    u: z.number().optional(),
    m: IdSchema.optional(),
  });

export interface PollworkerCardData extends CardData {
  readonly t: 'pollworker';
  /** Election hash */
  readonly h: string;
}
export const PollworkerCardDataSchema: z.ZodSchema<PollworkerCardData> =
  CardDataInternalSchema.extend({
    t: z.literal('pollworker'),
    h: ElectionHash,
  });

export interface AdminCardData extends CardData {
  readonly t: 'admin';
  /** Election hash */
  readonly h: string;
  /** Card Passcode */
  readonly p?: string;
}
export const AdminCardDataSchema: z.ZodSchema<AdminCardData> =
  CardDataInternalSchema.extend({
    t: z.literal('admin'),
    h: ElectionHash,
    p: z.string().optional(),
  });

/**
 * Beginning of the SuperAdmin card schema. More will be added to this as we fully flesh out this role
 * This is a minimal implementation for the purposes of rebooting from usb.
 */
export interface SuperAdminCardData extends CardData {
  readonly t: 'superadmin';
}
export const SuperAdminCardDataSchema: z.ZodSchema<SuperAdminCardData> =
  CardDataInternalSchema.extend({
    t: z.literal('superadmin'),
  });

export type AnyCardData =
  | VoterCardData
  | PollworkerCardData
  | AdminCardData
  | SuperAdminCardData;
export const AnyCardDataSchema: z.ZodSchema<AnyCardData> = z.union([
  VoterCardDataSchema,
  PollworkerCardDataSchema,
  AdminCardDataSchema,
  SuperAdminCardDataSchema,
]);
