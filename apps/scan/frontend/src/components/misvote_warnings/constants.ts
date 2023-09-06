import { SizeMode } from '@votingworks/types';
import { MisvoteWarningsConfig } from './types';

/**
 * Layout configuration params for each {@link SizeMode} - these were manually
 * tuned to make sure we display the full warning details whenever we can fit
 * them all on the main ScanWarningScreen without needing to scroll and display
 * a summary with a details modal button otherwise.
 *
 * Can be tweaked as needed, as the product evolves.
 */
export const CONFIG: Readonly<Record<SizeMode, MisvoteWarningsConfig>> = {
  s: {
    maxCardsPerRow: 3,
    maxColumnsPerCard: 3,
    maxPreviewContestRows: 8,
  },
  m: {
    maxCardsPerRow: 2,
    maxColumnsPerCard: 2,
    maxPreviewContestRows: 4,
  },
  l: {
    maxCardsPerRow: 1,
    maxColumnsPerCard: 2,
    maxPreviewContestRows: 3,
  },
  xl: {
    maxCardsPerRow: 1,
    maxColumnsPerCard: 1,
    maxPreviewContestRows: 2,
  },
  legacy: {
    maxCardsPerRow: 3,
    maxColumnsPerCard: 3,
    maxPreviewContestRows: 8,
  },
};
