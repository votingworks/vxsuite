import { Id, Tabulation } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import {
  GROUP_KEY_ROOT,
  extractGroupSpecifier,
  getEmptyCardCounts,
  getGroupKey,
  isGroupByEmpty,
  mergeTabulationGroups,
} from '@votingworks/utils';
import { CardTally } from '../types';
import { Store } from '../store';

import { tabulateManualBallotCounts } from './manual_results';

/**
 * Adds a card tally to a card counts object. Mutates the card counts object
 * in place and overwrites the previous count for the same card.
 */
function addCardTallyToCardCounts({
  cardCounts,
  cardTally,
}: {
  cardCounts: Tabulation.CardCounts;
  cardTally: CardTally;
}): Tabulation.CardCounts {
  const { card, tally } = cardTally;
  if (card.type === 'bmd') {
    // eslint-disable-next-line no-param-reassign
    cardCounts.bmd += tally;
  } else {
    // eslint-disable-next-line no-param-reassign
    cardCounts.hmpb[card.sheetNumber - 1] =
      (cardCounts.hmpb[card.sheetNumber - 1] ?? 0) + tally;
  }

  return cardCounts;
}

/**
 * Tabulates card tallies aggregated by the store into card counts.
 */
export function tabulateScannedCardCounts({
  electionId,
  store,
  groupBy,
}: {
  electionId: Id;
  store: Store;
  groupBy?: Tabulation.GroupBy;
}): Tabulation.GroupedCardCounts {
  const {
    electionDefinition: { election },
  } = assertDefined(store.getElection(electionId));

  const cardTallies = store.getCardTallies({
    electionId,
    election,
    groupBy,
  });

  const groupedCardCounts: Tabulation.GroupedCardCounts = {};

  // optimized special case, when the results do not need to be grouped
  if (!groupBy || isGroupByEmpty(groupBy)) {
    const cardCounts = getEmptyCardCounts();
    for (const cardTally of cardTallies) {
      addCardTallyToCardCounts({
        cardCounts,
        cardTally,
      });
    }
    groupedCardCounts[GROUP_KEY_ROOT] = cardCounts;
    return groupedCardCounts;
  }

  // general case, grouping results by specified group by clause
  for (const cardTally of cardTallies) {
    const groupKey = getGroupKey(cardTally, groupBy);

    const existingCardCounts = groupedCardCounts[groupKey];
    const cardCounts = existingCardCounts ?? {
      ...getEmptyCardCounts(),
      ...extractGroupSpecifier(cardTally),
    };

    groupedCardCounts[groupKey] = addCardTallyToCardCounts({
      cardCounts,
      cardTally,
    });
  }

  return groupedCardCounts;
}

/**
 * Calculate card counts, optionally grouped, including both scanned cards
 * and manual ballot counts.
 */
export function tabulateFullCardCounts({
  electionId,
  store,
  groupBy,
}: {
  electionId: Id;
  store: Store;
  groupBy?: Tabulation.GroupBy;
}): Tabulation.GroupedCardCounts {
  const {
    electionDefinition: { election },
  } = assertDefined(store.getElection(electionId));

  const groupedScannedCardCounts = tabulateScannedCardCounts({
    electionId,
    store,
    groupBy,
  });
  const tabulateManualBallotCountsResult = tabulateManualBallotCounts({
    election,
    manualResultsMetadataRecords: store.getManualResultsMetadata({
      electionId,
    }),
    groupBy,
  });

  if (tabulateManualBallotCountsResult.isErr()) {
    return groupedScannedCardCounts;
  }

  const groupedManualBallotCounts = tabulateManualBallotCountsResult.ok();

  return mergeTabulationGroups(
    groupedScannedCardCounts,
    groupedManualBallotCounts,
    (scannedCardCounts, manualBallotCount) => {
      return {
        ...(scannedCardCounts ?? getEmptyCardCounts()),
        manual: manualBallotCount?.ballotCount ?? 0,
      };
    }
  );
}
