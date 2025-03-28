import React, { useState } from 'react';
import { Button } from '@votingworks/ui';
import styled from 'styled-components';
import { Rect } from '@votingworks/types';

const BallotImageViewerContainer = styled.div`
  position: relative;
  height: 100%;
  overflow: hidden;
`;

// We zoom in by scaling (setting the width) and then translating to center the
// write-in on the screen (setting the top/left position).
const ZoomedInBallotImage = styled.img<{
  ballotBounds: Rect;
  zoomedInBounds: Rect;
  scale: number;
}>`
  /* stylelint-disable value-keyword-case */
  position: absolute;
  top: calc(
    (
      50% -
        ${(props) =>
          (props.zoomedInBounds.y + props.zoomedInBounds.height / 2) *
          props.scale}px
    )
  );
  left: calc(
    (
      50% -
        ${(props) =>
          (props.zoomedInBounds.x + props.zoomedInBounds.width / 2) *
          props.scale}px
    )
  );
  width: ${(props) => props.ballotBounds.width * props.scale}px;
`;

// We want to create a transparent overlay with a centered rectangle cut out of
// it of the size of the write-in area. There's not a super easy way to do this
// in CSS. Based on an idea from https://css-tricks.com/cutouts/, I used this
// tool to design the clipping path, https://bennettfeely.com/clippy/, and then
// parameterized it with the focus area width and height.
const WriteInFocusOverlay = styled.div<{
  focusWidth: number;
  focusHeight: number;
}>`
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  background: rgba(0, 0, 0, 50%);
  width: 100%;
  height: 100%;
  clip-path: polygon(
    0% 0%,
    0% 100%,
    calc(50% - ${(props) => props.focusWidth / 2}px) 100%,
    calc(50% - ${(props) => props.focusWidth / 2}px)
      calc(50% - ${(props) => props.focusHeight / 2}px),
    calc(50% + ${(props) => props.focusWidth / 2}px)
      calc(50% - ${(props) => props.focusHeight / 2}px),
    calc(50% + ${(props) => props.focusWidth / 2}px)
      calc(50% + ${(props) => props.focusHeight / 2}px),
    calc(50% - ${(props) => props.focusWidth / 2}px)
      calc(50% + ${(props) => props.focusHeight / 2}px),
    calc(50% - ${(props) => props.focusWidth / 2}px) 100%,
    100% 100%,
    100% 0%
  );
`;

// Full-width image with vertical scrolling.
const ZoomedOutBallotImageContainer = styled.div`
  height: 100%;
  overflow-y: scroll;

  img {
    width: 100%;
  }
`;

const BallotImageViewerControls = styled.div<{ isZoomedIn: boolean }>`
  display: flex;
  justify-content: flex-end;
  position: absolute;
  top: 0;
  z-index: 2;
  background: ${(props) => (!props.isZoomedIn ? 'rgba(0, 0, 0, 0.5)' : 'none')};
  width: 100%;
  padding: 0.5rem;
  gap: 0.5rem;
`;

export function BallotZoomImageViewer({
  imageUrl,
  ballotBounds,
  zoomedInBounds,
}: {
  imageUrl: string;
  ballotBounds: Rect;
  zoomedInBounds: Rect;
}): JSX.Element {
  const [isZoomedIn, setIsZoomedIn] = useState(true);

  const IMAGE_SCALE = 0.5; // The images are downscaled by 50% during CVR export, this is to adjust for that.

  let zoomedInScale: number | null = null;
  if (zoomedInBounds.width > zoomedInBounds.height) {
    zoomedInScale = (ballotBounds.width / zoomedInBounds.width) * IMAGE_SCALE;
  } else {
    zoomedInScale = (ballotBounds.height / zoomedInBounds.height) * IMAGE_SCALE;
  }

  return (
    <BallotImageViewerContainer>
      <BallotImageViewerControls isZoomedIn={isZoomedIn}>
        <Button
          icon={isZoomedIn ? 'ZoomOut' : 'ZoomIn'}
          onPress={() => setIsZoomedIn(!isZoomedIn)}
          color="neutral"
          fill="tinted"
        >
          Zoom {isZoomedIn ? 'Out' : 'In'}
        </Button>
      </BallotImageViewerControls>
      {isZoomedIn ? (
        <React.Fragment>
          <WriteInFocusOverlay
            focusWidth={zoomedInBounds.width * zoomedInScale}
            focusHeight={zoomedInBounds.height * zoomedInScale}
          />
          <ZoomedInBallotImage
            src={imageUrl}
            alt="Ballot with write-in highlighted"
            ballotBounds={ballotBounds}
            zoomedInBounds={zoomedInBounds}
            scale={zoomedInScale}
          />
        </React.Fragment>
      ) : (
        <ZoomedOutBallotImageContainer>
          <img src={imageUrl} alt="Full ballot" />
        </ZoomedOutBallotImageContainer>
      )}
    </BallotImageViewerContainer>
  );
}

export function BallotStaticImageViewer({
  imageUrl,
}: {
  imageUrl: string;
}): JSX.Element {
  return (
    <BallotImageViewerContainer>
      <ZoomedOutBallotImageContainer>
        <img src={imageUrl} alt="Full ballot" />
      </ZoomedOutBallotImageContainer>
    </BallotImageViewerContainer>
  );
}
