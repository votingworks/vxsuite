import React, { useRef } from 'react';

export interface Props {
  imageUrl: string;
}

export function BallotSheetImage({ imageUrl }: Props): JSX.Element {
  const imageRef = useRef<HTMLImageElement>(null);

  return (
    <div style={{ position: 'relative' }}>
      <img
        ref={imageRef}
        src={imageUrl}
        alt="front"
        style={{ maxWidth: '100%', maxHeight: '82vh' }}
      />
    </div>
  );
}
