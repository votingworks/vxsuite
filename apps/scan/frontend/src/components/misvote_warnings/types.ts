import { Contest } from '@votingworks/types';

export interface MisvoteWarningsProps {
  blankContests: readonly Contest[];
  overvoteContests: readonly Contest[];
  partiallyVotedContests: readonly Contest[];
}

export interface MisvoteWarningsConfig {
  maxCardsPerRow: number;
  maxColumnsPerCard: number;
  maxPreviewContestRows: number;
}

export interface Layout {
  maxColumnsPerCard: number;
  numCardsPerRow: number;
  showSummaryInPreview?: boolean;
}
