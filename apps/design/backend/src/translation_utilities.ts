import { hasSplits, Precinct } from './types';

export function getUserDefinedHmpbStrings(
  precincts: Precinct[]
): Record<string, string> {
  const catalog: Record<string, string> = {};
  for (const precinct of precincts) {
    if (hasSplits(precinct)) {
      for (const split of precinct.splits) {
        if (split.clerkSignatureCaption) {
          // TODO put this in a Record
          catalog[`hmpbClerkSignatureCaption_${split.id}`] =
            split.clerkSignatureCaption;
        }
        if (split.electionTitleOverride) {
          catalog[`hmpbElectionTitleOverride_${split.id}`] =
            split.electionTitleOverride;
        }
      }
    }
  }

  return catalog;
}
