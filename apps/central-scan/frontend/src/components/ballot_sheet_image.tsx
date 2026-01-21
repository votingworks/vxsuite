import { BallotPageLayout, Contest, Id, Side } from '@votingworks/types';
import { iter } from '@votingworks/basics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getSheetImage } from '../api';

export interface Props {
  sheetId: Id;
  side: Side;
  layout?: BallotPageLayout;
  contestIds?: ReadonlyArray<Contest['id']>;
  styleForContest?(contestId: Contest['id']): React.CSSProperties;
  onMouseEnterContest?(contestId: Contest['id']): void;
  onMouseLeaveContest?(contestId: Contest['id']): void;
}

export function BallotSheetImage({
  sheetId,
  side,
  layout,
  contestIds,
  styleForContest,
  onMouseEnterContest,
  onMouseLeaveContest,
}: Props): JSX.Element {
  const getSheetImageQuery = getSheetImage.useQuery({ sheetId, side });
  const imageRef = useRef<HTMLImageElement>(null);

  const [xScaleValue, setXScaleValue] = useState(0);
  const [yScaleValue, setYScaleValue] = useState(0);

  const recalculateScale = useCallback(() => {
    if (!layout || !imageRef.current || imageRef.current.clientWidth === 0) {
      return;
    }

    const width = imageRef.current.clientWidth;
    const height = imageRef.current.clientHeight;
    setXScaleValue(width / layout.pageSize.width);
    setYScaleValue(height / layout.pageSize.height);
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

  const [imageSrc, setImageSrc] = useState<string>();

  useEffect(() => {
    const imageBuffer = getSheetImageQuery.data;

    if (!imageBuffer) {
      setImageSrc(undefined);
      return;
    }

    const blob = new Blob([new Uint8Array(imageBuffer)]);
    const objectUrl = URL.createObjectURL(blob);
    setImageSrc(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [getSheetImageQuery.data]);

  return (
    <div style={{ position: 'relative' }}>
      <img
        ref={imageRef}
        src={imageSrc}
        alt="front"
        onLoad={recalculateScale}
        style={{ maxWidth: '100%', maxHeight: '82vh' }}
      />
      {layout &&
        contestIds &&
        iter(layout.contests)
          .zip(contestIds)
          .map(([contestLayout, contestId]) => (
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
                ...(styleForContest?.(contestId) ?? {}),
              }}
            />
          ))
          .toArray()}
    </div>
  );
}
