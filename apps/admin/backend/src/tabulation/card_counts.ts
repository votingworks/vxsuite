import { Id, Tabulation } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import {
  GROUP_KEY_ROOT,
  getEmptyCardCounts,
  getGroupKey,
  isGroupByEmpty,
  mergeTabulationGroupMaps,
} from '@votingworks/utils';
import { CardTally } from '../types';
import { Store } from '../store';
import { tabulateManualBallotCounts } from './manual_results';
import { rootDebug } from '../util/debug';

const debug = rootDebug.extend('card-counts');

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
  blankBallotsOnly = false,
}: {
  electionId: Id;
  store: Store;
  groupBy?: Tabulation.GroupBy;
  blankBallotsOnly?: boolean;
}): Tabulation.GroupMap<Tabulation.CardCounts> {
  const {
    electionDefinition: { election },
  } = assertDefined(store.getElection(electionId));

  const cardTallies = store.getCardTallies({
    electionId,
    election,
    groupBy,
    blankBallotsOnly,
  });

  const cardCountsGroupMap: Tabulation.GroupMap<Tabulation.CardCounts> = {};

  // optimized special case, when the results do not need to be grouped
  if (!groupBy || isGroupByEmpty(groupBy)) {
    const cardCounts = getEmptyCardCounts();
    for (const cardTally of cardTallies) {
      addCardTallyToCardCounts({
        cardCounts,
        cardTally,
      });
    }
    cardCountsGroupMap[GROUP_KEY_ROOT] = cardCounts;
    return cardCountsGroupMap;
  }

  // general case, grouping results by specified group by clause
  for (const cardTally of cardTallies) {
    const groupKey = getGroupKey(cardTally, groupBy);

    const existingCardCounts = cardCountsGroupMap[groupKey];
    const cardCounts = existingCardCounts ?? getEmptyCardCounts();

    cardCountsGroupMap[groupKey] = addCardTallyToCardCounts({
      cardCounts,
      cardTally,
    });
  }

  return cardCountsGroupMap;
}

/**
 * Calculate card counts, optionally grouped, including both scanned cards
 * and manual ballot counts.
 */
export function tabulateFullCardCounts({
  electionId,
  store,
  groupBy,
  blankBallotsOnly = false,
}: {
  electionId: Id;
  store: Store;
  groupBy?: Tabulation.GroupBy;
  blankBallotsOnly?: boolean;
}): Tabulation.GroupMap<Tabulation.CardCounts> {
  const {
    electionDefinition: { election },
  } = assertDefined(store.getElection(electionId));
  debug('tabulating card counts for the following group by: %o', groupBy ?? {});

  const groupedScannedCardCounts = tabulateScannedCardCounts({
    electionId,
    store,
    groupBy,
  });
  if (blankBallotsOnly) {
    // we do not manage manually entered blank ballots within the system
    return groupedScannedCardCounts;
  }

  const tabulateManualBallotCountsResult = tabulateManualBallotCounts({
    election,
    manualResultsMetadataRecords: store.getManualResultsMetadata({
      electionId,
    }),
    groupBy,
  });
  if (tabulateManualBallotCountsResult.isErr()) {
    debug(
      'tabulated card counts, omitted manual ballot counts due to incompatible group by'
    );
    return groupedScannedCardCounts;
  }

  debug('tabulated card counts');
  const groupedManualBallotCounts = tabulateManualBallotCountsResult.ok();
  return mergeTabulationGroupMaps(
    groupedScannedCardCounts,
    groupedManualBallotCounts,
    (scannedCardCounts, manualBallotCount) => {
      return {
        ...(scannedCardCounts ?? getEmptyCardCounts()),
        manual: manualBallotCount ?? 0,
      };
    }
  );
}
