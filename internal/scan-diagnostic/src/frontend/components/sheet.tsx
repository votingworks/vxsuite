import { BallotTargetMark, Id, MarkThresholds } from '@votingworks/types';
import React from 'react';
import { PageImage } from './page_image';

/**
 * Represents a single sheet of paper in a ballot.
 */
export function Sheet({
  sheetId,
  markThresholds,
  frontMarks,
  backMarks,
  onSwap,
  onRotate,
}: {
  sheetId: Id;
  markThresholds: MarkThresholds;
  frontMarks: readonly BallotTargetMark[];
  backMarks: readonly BallotTargetMark[];
  onSwap: () => void;
  onRotate: () => void;
}): JSX.Element {
  return (
    <div className="sheet">
      <PageImage
        sheetId={sheetId}
        side="front"
        marks={frontMarks}
        markThresholds={markThresholds}
      />
      <PageImage
        sheetId={sheetId}
        side="back"
        marks={backMarks}
        markThresholds={markThresholds}
      />
      <div className="sheet-tools">
        <button
          type="button"
          className="rotate-button"
          onClick={onSwap}
          title="Switch the front & back images and save the result"
        >
          Swap
        </button>
        <button
          type="button"
          className="rotate-button"
          onClick={onRotate}
          title="Rotate the front & back images and save the result"
        >
          Rotate
        </button>
      </div>
    </div>
  );
}
