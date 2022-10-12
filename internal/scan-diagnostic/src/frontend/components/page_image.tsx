import {
  getScannedBallotCardGeometry,
  templates,
} from '@votingworks/ballot-interpreter-nh';
import {
  getImageChannelCount,
  int,
  isRgba,
  toDataUrl,
  toImageData,
} from '@votingworks/image-utils';
import {
  BallotPaperSize,
  BallotTargetMark,
  Id,
  MarkThresholds,
  Offset,
  Rect,
} from '@votingworks/types';
import { assert, format } from '@votingworks/utils';
import { createImageData } from 'canvas';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { markClassName } from '../utils/mark_class_name';
import { markKey } from '../utils/mark_key';

type RGBA = [int, int, int, int];

/**
 * Computes the color of a pixel by blending `src` on top of `dst`.
 *
 * @see https://en.wikipedia.org/wiki/Alpha_compositing#Alpha_blending
 */
function alphaBlend(dst: RGBA, src: RGBA): RGBA {
  if (src[3] === 0) {
    return dst;
  }

  if (dst[3] === 0) {
    return src;
  }

  if (src[3] === 0xff) {
    return src;
  }

  const dstR = dst[0];
  const dstG = dst[1];
  const dstB = dst[2];
  const dstA = dst[3];
  const srcR = src[0];
  const srcG = src[1];
  const srcB = src[2];
  const srcA = src[3];
  return [
    (srcR * srcA) / 0xff + ((dstR * dstA) / 0xff) * (1 - srcA / 0xff),
    (srcG * srcA) / 0xff + ((dstG * dstA) / 0xff) * (1 - srcA / 0xff),
    (srcB * srcA) / 0xff + ((dstB * dstA) / 0xff) * (1 - srcA / 0xff),
    (srcA / 0xff + (1 - srcA / 0xff)) * 0xff,
  ];
}

function rectShift(rect: Rect, shift: Offset): Rect {
  return {
    x: rect.x + shift.x,
    y: rect.y + shift.y,
    width: rect.width,
    height: rect.height,
  };
}

function drawBox(
  imageData: ImageData,
  rect: Rect,
  fillColor: RGBA,
  strokeColor: RGBA,
  lineWidth: number
): void {
  const channels = getImageChannelCount(imageData);
  assert(isRgba(imageData), 'imageData must be RGBA');
  const { data, width } = imageData;

  for (
    let { y } = rect, offset = (rect.y * width + rect.x) * channels;
    y < rect.y + rect.height;
    y += 1, offset += (width - rect.width) * channels
  ) {
    for (
      let { x } = rect;
      x < rect.x + rect.width;
      x += 1, offset += channels
    ) {
      const pixel = alphaBlend(
        [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]],
        fillColor
      );

      data.set(
        x - rect.x < lineWidth ||
          x - rect.x >= rect.width - lineWidth ||
          y - rect.y < lineWidth ||
          y - rect.y >= rect.height - lineWidth
          ? alphaBlend(pixel, strokeColor)
          : pixel,
        offset
      );
    }
  }
}

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
  const [imageData, setImageData] = useState<ImageData>();
  const [ovalScanTemplate, setOvalScanTemplate] = useState<ImageData>();

  const geometry = getScannedBallotCardGeometry(BallotPaperSize.Letter);

  useEffect(() => {
    const image = new Image();
    image.src = `/api/sheets/${sheetId}/images/${side}`;
    image.onload = () => {
      setImageData(
        toImageData(image, {
          maxWidth: geometry.canvasSize.width,
          maxHeight: geometry.canvasSize.height,
        })
      );
    };
  }, [geometry.canvasSize.height, geometry.canvasSize.width, sheetId, side]);

  let displayImageData: ImageData | undefined;

  if (imageData) {
    displayImageData = createImageData(imageData.width, imageData.height);
    displayImageData.data.set(imageData.data);
    for (const mark of marks) {
      // draw the original expected bounds
      drawBox(
        displayImageData,
        rectShift(mark.bounds, {
          x: -mark.scoredOffset.x,
          y: -mark.scoredOffset.y,
        }),
        [0, 0, 0xff, 0x33],
        [0, 0, 0xff, 0x99],
        1
      );
      // draw the detected best match bounds
      drawBox(
        displayImageData,
        mark.bounds,
        [0, 0xff, 0, 0x33],
        [0, 0xff, 0, 0x99],
        1
      );
    }
  }

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
                markClassName(mark.score, markThresholds),
              ].join(' ')}
              style={boundsStyle(mark.bounds, scale)}
            >
              {format.percent(mark.score, { maximumFractionDigits: 2 })}
            </div>
          ))}
        </React.Fragment>
      )}
      <img
        ref={imageRef}
        onLoad={onImageLoad}
        className="ballot-image"
        src={displayImageData && toDataUrl(displayImageData, 'image/jpeg')}
        alt={`Scanned ${side} of ballot`}
      />
    </div>
  );
}
