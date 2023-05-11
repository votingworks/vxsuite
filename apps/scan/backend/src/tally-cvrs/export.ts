import {
  BallotIdSchema,
  CastVoteRecord,
  InterpretedHmpbPage,
  PageInterpretation,
  mapSheet,
  unsafeParse,
} from '@votingworks/types';
import { getContestsForBallotPage } from '@votingworks/backend';
import { Store } from '../store';
import { buildCastVoteRecord } from './build';

function isHmpbPage(
  interpretation: PageInterpretation
): interpretation is InterpretedHmpbPage {
  return interpretation.type === 'InterpretedHmpbPage';
}

export function* exportCastVoteRecords({
  store,
}: {
  store: Store;
}): Generator<CastVoteRecord> {
  const electionDefinition = store.getElectionDefinition();

  if (!electionDefinition) {
    throw new Error('no election configured');
  }

  for (const {
    id,
    batchId,
    batchLabel,
    interpretation,
  } of store.forEachResultSheet()) {
    const cvr = buildCastVoteRecord(
      id,
      batchId,
      batchLabel || '',
      (interpretation[0].type === 'InterpretedBmdPage' &&
        interpretation[0].ballotId) ||
        (interpretation[1].type === 'InterpretedBmdPage' &&
          interpretation[1].ballotId) ||
        unsafeParse(BallotIdSchema, id),
      electionDefinition.election,
      mapSheet(interpretation, (page) => ({
        interpretation: page,
        contestIds: isHmpbPage(page)
          ? getContestsForBallotPage({
              election: electionDefinition.election,
              ballotPageMetadata: page.metadata,
            }).map((contest) => contest.id)
          : undefined,
      }))
    );

    if (cvr) {
      yield cvr;
    }
  }
}
