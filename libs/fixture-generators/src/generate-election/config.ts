/* eslint-disable vx/gts-jsdoc */
import z from 'zod';

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

/**
 * TODO once we set our system limits, we should set this default config to
 * those values.
 */
export const defaultConfig: GenerateElectionConfig = {
  numDistricts: 100,
  numPrecincts: 1000,
  numBallotStyles: 1000,
  numParties: 10,
  numContests: 100,
  numCandidatesPerContest: 100,
  maxContestVoteFor: 50,
  maxStringLengths: {
    title: 100,
    countyName: 100,
    stateName: 100,
    districtName: 100,
    precinctName: 100,
    partyShortName: 100,
    partyFullName: 100,
    partyAbbreviation: 10,
    contestTitle: 100,
    contestTermDescription: 100,
    candidateName: 100,
    contestBallotMeasureText: 1000,
    contestBallotMeasureOptionLabel: 100,
  },
};
