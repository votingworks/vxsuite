import { z } from 'zod/v4';
import { Id } from './generic';

export interface LaCandidateAddress {
  addressLine1: string;
  addressLine2: string;
}

export const LaCandidateAddressSchema: z.ZodSchema<LaCandidateAddress> =
  z.object({
    addressLine1: z.string(),
    addressLine2: z.string(),
  });

export interface LaPresidentialCandidateBallotStrings {
  presidentialCandidateName: string;
  presidentialCandidateState: string;
  vicePresidentialCandidateName: string;
  vicePresidentialCandidateState: string;
  electors: string[];
  party: string;
  partyIcon?: string;
}

export const LaPresidentialCandidateBallotStringsSchema: z.ZodSchema<LaPresidentialCandidateBallotStrings> =
  z.object({
    presidentialCandidateName: z.string(),
    presidentialCandidateState: z.string(),
    vicePresidentialCandidateName: z.string(),
    vicePresidentialCandidateState: z.string(),
    electors: z.array(z.string()),
    party: z.string(),
    partyIcon: z.string().optional(),
  });

export interface LaCustomBallotContent {
  /** Candidate ID to address */
  candidateAddresses?: Record<Id, LaCandidateAddress>;

  externalToVxIdMapping?: ExternalToVxIdMapping;

  /** Candidate ID to ballot text */
  presidentialCandidateBallotStrings?: Record<
    Id,
    LaPresidentialCandidateBallotStrings
  >;
}

export interface ExternalToVxIdMapping {
  /** External candidate ID to Vx candidate ID mapping. */
  candidates: Record<string, string>;

  /** External contest ID to Vx contest ID mapping. */
  contests: Record<string, string>;
}

export const LaCustomBallotContentSchema: z.ZodSchema<LaCustomBallotContent> =
  z.object({
    candidateAddresses: z
      .record(z.string(), LaCandidateAddressSchema)
      .optional(),
    presidentialCandidateBallotStrings: z
      .record(z.string(), LaPresidentialCandidateBallotStringsSchema)
      .optional(),
    externalToVxIdMapping: z
      .object({
        candidates: z.record(z.string(), z.string()),
        contests: z.record(z.string(), z.string()),
      })
      .optional(),
  });
