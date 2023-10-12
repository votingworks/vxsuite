import { TouchSizeMode } from '@votingworks/types';
import { MisvoteWarningsConfig } from './types';

/**
 * Layout configuration params for each {@link TouchSizeMode} - these were manually
 * tuned to make sure we display the full warning details whenever we can fit
 * them all on the main ScanWarningScreen without needing to scroll and display
 * a summary with a details modal button otherwise.
 *
 * Can be tweaked as needed, as the product evolves.
 */
export const CONFIG: Readonly<Record<TouchSizeMode, MisvoteWarningsConfig>> = {
  touchSmall: {
    maxCardsPerRow: 3,
    maxColumnsPerCard: 3,
    maxPreviewContestRows: 8,
  },
  touchMedium: {
    maxCardsPerRow: 2,
    maxColumnsPerCard: 2,
    maxPreviewContestRows: 4,
  },
  touchLarge: {
    maxCardsPerRow: 1,
    maxColumnsPerCard: 2,
    maxPreviewContestRows: 3,
  },
  touchExtraLarge: {
    maxCardsPerRow: 1,
    maxColumnsPerCard: 1,
    maxPreviewContestRows: 2,
  },
};
