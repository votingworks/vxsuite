import { hasSplits, Precinct } from './types';

export function getUserDefinedHmpbStrings(
  precincts: Precinct[]
): Record<string, string> {
  const catalog: Record<string, string> = {};
  for (const precinct of precincts) {
    if (hasSplits(precinct)) {
      for (const split of precinct.splits) {
        if (split.clerkSignatureCaption) {
          catalog[`hmpbClerkSignatureCaption_${precinct.id}_${split.id}`] =
            split.clerkSignatureCaption;
        }
        if (split.electionTitleOverride) {
          catalog[`hmpbElectionTitleOverride_${precinct.id}_${split.id}`] =
            split.electionTitleOverride;
        }
      }
    }
  }

  return catalog;
}
