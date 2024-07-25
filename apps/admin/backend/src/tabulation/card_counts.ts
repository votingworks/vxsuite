import { Admin, Id, Tabulation } from '@votingworks/types';
import {
  GROUP_KEY_ROOT,
  getEmptyCardCounts,
  getGroupKey,
  groupBySupportsZeroSplits,
  isGroupByEmpty,
  mergeTabulationGroupMaps,
} from '@votingworks/utils';
import { CardTally } from '../types';
import { Store } from '../store';
import { tabulateManualBallotCounts } from './manual_results';
import { rootDebug } from '../util/debug';
import { assertIsBackendFilter } from '../util/filters';

const debug = rootDebug.extend('card-counts');

/**
 * Adds a card tally to a card counts object. Mutates the card counts object
 * in place.
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
      /* istanbul ignore next - trivial fallback case */
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
  filter,
  groupBy,
}: {
  electionId: Id;
  store: Store;
  filter?: Admin.ReportingFilter;
  groupBy?: Tabulation.GroupBy;
}): Tabulation.GroupMap<Tabulation.CardCounts> {
  assertIsBackendFilter(filter);
  debug('querying scanned card tallies');
  const cardTallies = store.getCardTallies({
    electionId,
    filter,
    groupBy,
  });

  const cardCountsGroupMap: Tabulation.GroupMap<Tabulation.CardCounts> = {};

  // optimized special case, when the results do not need to be grouped
  if (!groupBy || isGroupByEmpty(groupBy)) {
    debug('combining card tallies into ungrouped card counts');
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

  const hasExpectedGroups = groupBySupportsZeroSplits(groupBy);
  if (hasExpectedGroups) {
    debug('determining expected card count groups');
    const expectedGroups = store.getTabulationGroups({
      electionId,
      groupBy,
      filter,
    });
    for (const expectedGroup of expectedGroups) {
      cardCountsGroupMap[getGroupKey(expectedGroup, groupBy)] =
        getEmptyCardCounts();
    }
  }

  for (const cardTally of cardTallies) {
    debug('combining card tallies into grouped card counts');
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
  filter,
  groupBy,
}: {
  electionId: Id;
  store: Store;
  filter?: Admin.ReportingFilter;
  groupBy?: Tabulation.GroupBy;
}): Tabulation.GroupMap<Tabulation.CardCounts> {
  debug('begin tabulating full card counts');

  const groupedScannedCardCounts = tabulateScannedCardCounts({
    electionId,
    store,
    filter,
    groupBy,
  });

  const tabulateManualBallotCountsResult = tabulateManualBallotCounts({
    electionId,
    store,
    filter,
    groupBy,
  });

  if (tabulateManualBallotCountsResult.isErr()) {
    debug('omitting manual ballot counts due to incompatible parameters');
    return groupedScannedCardCounts;
  }

  debug('merging manual ballot counts into scanned card counts');
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
