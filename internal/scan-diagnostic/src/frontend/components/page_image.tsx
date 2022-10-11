import {
  getScannedBallotCardGeometry,
  templates,
} from '@votingworks/ballot-interpreter-nh';
import {
  BallotPaperSize,
  BallotTargetMark,
  Id,
  ImageData,
  MarkThresholds,
  Offset,
  Rect,
} from '@votingworks/types';
import { format } from '@votingworks/utils';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { markClassName } from '../utils/mark_class_name';
import { markKey } from '../utils/mark_key';

/**
 * Represents an image of a single page of a ballot.
 */
export function PageImage({
  sheetId,
  side,
  marks,
  markThresholds,
}: {
  sheetId: Id;
  side: 'front' | 'back';
  marks: readonly BallotTargetMark[];
  markThresholds: MarkThresholds;
}): JSX.Element | null {
  const imageRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState<number>();
  const [ovalScanTemplate, setOvalScanTemplate] = useState<ImageData>();

  const geometry = getScannedBallotCardGeometry(BallotPaperSize.Letter);

  const onImageLoad = useCallback(() => {
    const image = imageRef.current;
    if (!image) {
      return;
    }

    const { width } = image.getBoundingClientRect();
    const { canvasSize } = geometry;
    const naturalWidth = canvasSize.width;

    setScale(width / naturalWidth);
  }, [geometry]);

  function boundsStyle(bounds: Rect, objectScale: number): React.CSSProperties {
    return {
      position: 'absolute',
      left: `${bounds.x * objectScale}px`,
      top: `${bounds.y * objectScale}px`,
      width: `${bounds.width * objectScale}px`,
      height: `${bounds.height * objectScale}px`,
    };
  }

  function rectShift(rect: Rect, shift: Offset): Rect {
    return {
      x: rect.x + shift.x,
      y: rect.y + shift.y,
      width: rect.width,
      height: rect.height,
    };
  }

  useEffect(() => {
    void (async () => {
      setOvalScanTemplate(await templates.getOvalScanTemplate());
    })();
  }, []);

  useEffect(() => {
    // watch for resize event and recompute scale
    window.addEventListener('resize', onImageLoad);
    return () => window.removeEventListener('resize', onImageLoad);
  }, [onImageLoad]);

  if (!ovalScanTemplate) {
    return null;
  }

  return (
    <div className="page-image" style={{ position: 'relative' }}>
      {typeof scale === 'number' && (
        <React.Fragment>
          {marks.map((mark) => (
            <div
              key={markKey(mark)}
              className={[
                'mark-score',
                markClassName(mark, markThresholds),
              ].join(' ')}
              style={boundsStyle(mark.bounds, scale)}
            >
              {format.percent(mark.score, { maximumFractionDigits: 2 })}
            </div>
          ))}
          {marks.map((mark) => (
            <div
              key={markKey(mark)}
              className="mark-bounds mark-bounds-expected"
              style={boundsStyle(mark.bounds, scale)}
            />
          ))}
          {marks.map((mark) => (
            <div
              key={markKey(mark)}
              className="mark-bounds mark-bounds-actual"
              style={boundsStyle(
                rectShift(mark.bounds, mark.scoredOffset),
                scale
              )}
            />
          ))}
        </React.Fragment>
      )}
      <img
        ref={imageRef}
        onLoad={onImageLoad}
        className="ballot-image"
        src={`/api/sheets/${sheetId}/images/${side}`}
        alt={`Scanned ${side} of ballot`}
      />
    </div>
  );
}
