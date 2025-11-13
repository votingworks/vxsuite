/* eslint-disable vx/gts-jsdoc */
import { SYSTEM_LIMITS } from '@votingworks/types';
import z from 'zod/v4';

const positiveInt = z.number().int().min(1);

export const GenerateElectionConfigSchema = z.object({
  numDistricts: positiveInt,
  numPrecincts: positiveInt,
  numBallotStyles: positiveInt,
  numParties: positiveInt,
  numContests: positiveInt,
  numCandidatesPerContest: positiveInt,
  maxContestVoteFor: positiveInt,
  maxStringLengths: z.object({
    title: positiveInt,
    countyName: positiveInt,
    stateName: positiveInt,
    districtName: positiveInt,
    precinctName: positiveInt,
    partyShortName: positiveInt,
    partyFullName: positiveInt,
    partyAbbreviation: positiveInt,
    contestTitle: positiveInt,
    contestTermDescription: positiveInt,
    candidateName: positiveInt,
    contestBallotMeasureText: positiveInt,
    contestBallotMeasureOptionLabel: positiveInt,
  }),
});

export type GenerateElectionConfig = z.infer<
  typeof GenerateElectionConfigSchema
>;

export const defaultConfig: GenerateElectionConfig = {
  numDistricts: 100,
  numPrecincts: SYSTEM_LIMITS.election.precincts,
  numBallotStyles: SYSTEM_LIMITS.election.ballotStyles,
  numParties: 10,
  numContests: SYSTEM_LIMITS.election.contests,
  numCandidatesPerContest: SYSTEM_LIMITS.contest.candidates,
  maxContestVoteFor: SYSTEM_LIMITS.contest.seats,
  maxStringLengths: {
    title: SYSTEM_LIMITS.textField.characters,
    countyName: SYSTEM_LIMITS.textField.characters,
    stateName: SYSTEM_LIMITS.textField.characters,
    districtName: SYSTEM_LIMITS.textField.characters,
    precinctName: SYSTEM_LIMITS.textField.characters,
    partyShortName: SYSTEM_LIMITS.textField.characters,
    partyFullName: SYSTEM_LIMITS.textField.characters,
    partyAbbreviation: SYSTEM_LIMITS.textField.characters,
    contestTitle: SYSTEM_LIMITS.textField.characters,
    contestTermDescription: SYSTEM_LIMITS.textField.characters,
    candidateName: SYSTEM_LIMITS.textField.characters,
    contestBallotMeasureText: SYSTEM_LIMITS.propositionTextField.characters,
    contestBallotMeasureOptionLabel: SYSTEM_LIMITS.textField.characters,
  },
};

/**
 * Zod's `deepPartial` is not available in v4, so we manually create a
 * schema in which all properties, including nested properties, are optional.
 */
export const DeepPartialGenerateElectionConfigSchema = z.object({
  ...GenerateElectionConfigSchema.partial().shape,
  maxStringLengths:
    GenerateElectionConfigSchema.shape.maxStringLengths.partial(),
});
