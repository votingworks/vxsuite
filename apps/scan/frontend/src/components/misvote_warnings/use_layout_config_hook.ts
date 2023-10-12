import React from 'react';
import { useTheme } from 'styled-components';

import { isTouchSizeMode } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { CONFIG } from './constants';
import { Layout, MisvoteWarningsProps } from './types';

export function useLayoutConfig(props: MisvoteWarningsProps): Layout {
  const { blankContests, overvoteContests, partiallyVotedContests } = props;
  const { sizeMode } = useTheme();
  assert(isTouchSizeMode(sizeMode));
  const config = CONFIG[sizeMode];

  return React.useMemo(() => {
    const numCards = [
      blankContests,
      overvoteContests,
      partiallyVotedContests,
    ].filter((contests) => contests.length > 0).length;
    const numCardsPerRow = Math.min(numCards, config.maxCardsPerRow);

    const maxColumnsPerCard = Math.max(
      1,
      Math.floor(config.maxColumnsPerCard / numCardsPerRow)
    );

    const maxContestListLength = Math.max(
      blankContests.length,
      overvoteContests.length,
      partiallyVotedContests.length
    );
    const maxContestRows = maxContestListLength / maxColumnsPerCard;

    // NOTE: The main ScanWarningScreen only has enough room for 1 row of cards
    // at all sizes.
    const showSummaryInPreview =
      numCards > config.maxCardsPerRow ||
      maxContestRows > config.maxPreviewContestRows;

    return {
      maxColumnsPerCard,
      numCardsPerRow,
      showSummaryInPreview,
    };
  }, [config, blankContests, overvoteContests, partiallyVotedContests]);
}
