import { Contest, SerializableBallotPageLayout } from '@votingworks/types';
import { zip } from '@votingworks/utils';
import React, { useCallback, useRef, useState } from 'react';

export interface Props {
  imageURL: string;
  layout?: SerializableBallotPageLayout;
  contestIds?: ReadonlyArray<Contest['id']>;
  styleForContest?(contestId: Contest['id']): React.CSSProperties;
  onMouseEnterContest?(contestId: Contest['id']): void;
  onMouseLeaveContest?(contestId: Contest['id']): void;
}

export default function BallotSheetImage({
  imageURL,
  layout,
  contestIds,
  styleForContest,
  onMouseEnterContest,
  onMouseLeaveContest,
}: Props): JSX.Element {
  const imageRef = useRef<HTMLImageElement>(null);

  const [xScaleValue, setXScaleValue] = useState(0);
  const [yScaleValue, setYScaleValue] = useState(0);

  const recalculateScale = useCallback(() => {
    if (!layout || !imageRef.current || imageRef.current.clientWidth === 0) {
      return;
    }

    const width = imageRef.current.clientWidth;
    const height = imageRef.current.clientHeight;
    setXScaleValue(width / layout.ballotImage.imageData.width);
    setYScaleValue(height / layout.ballotImage.imageData.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, imageRef.current]);

  const scaleX = useCallback(
    (ballotLength: number): number => ballotLength * xScaleValue,
    [xScaleValue]
  );

  const scaleY = useCallback(
    (ballotLength: number): number => ballotLength * yScaleValue,
    [yScaleValue]
  );

  const onMouseEnter: React.MouseEventHandler = useCallback(
    (event) => {
      const target = event.currentTarget as HTMLElement;
      const { contestId } = target.dataset;

      if (contestId) {
        onMouseEnterContest?.(contestId);
      }
    },
    [onMouseEnterContest]
  );

  const onMouseLeave: React.MouseEventHandler = useCallback(
    (event) => {
      const target = event.currentTarget as HTMLElement;
      const { contestId } = target.dataset;

      if (contestId) {
        onMouseLeaveContest?.(contestId);
      }
    },
    [onMouseLeaveContest]
  );

  return (
    <div style={{ position: 'relative' }}>
      <img
        ref={imageRef}
        src={imageURL}
        alt="front"
        onLoad={recalculateScale}
        style={{ maxWidth: '100%', maxHeight: '87vh' }}
      />
      {layout &&
        contestIds &&
        [...zip(layout.contests, contestIds)].map(
          ([contestLayout, contestId]) => (
            <div
              key={contestId}
              data-contest-id={contestId}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              style={{
                position: 'absolute',
                left: `${scaleX(contestLayout.bounds.x)}px`,
                top: `${scaleY(contestLayout.bounds.y)}px`,
                width: `${scaleX(contestLayout.bounds.width)}px`,
                height: `${scaleY(contestLayout.bounds.height)}px`,
                ...styleForContest?.(contestId),
              }}
            />
          )
        )}
    </div>
  );
}
