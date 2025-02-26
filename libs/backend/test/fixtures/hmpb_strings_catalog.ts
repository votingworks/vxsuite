/**
 * A mock of the HMPB strings catalog for testing purposes. We can't import the actual HMPB strings
 * catalog from libs/hmpb as that introduces a circular dependency.
 */
export const mockHmpbStringsCatalog = {
  hmpbOfficialBallot: 'Official Ballot',
  hmpbVoteFor1: 'Vote for 1',
} satisfies Record<string, string>;
