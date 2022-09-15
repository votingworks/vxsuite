import { Rect } from '@votingworks/types';
import React, { useEffect, useState } from 'react';

export interface CroppedImageProps {
  src: string;
  alt: string;
  crop: Rect;
  style?: React.CSSProperties;
}

export function CroppedImage({
  src,
  alt,
  crop,
  style,
}: CroppedImageProps): JSX.Element {
  const [dataUrl, setDataUrl] = useState<string>();

  useEffect(() => {
    const image = new Image();
    image.src = src;
    /* istanbul ignore next - I don't know how to test thing */
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = crop.width;
      canvas.height = crop.height;
      const context = canvas.getContext('2d');

      if (context) {
        context.drawImage(image, -crop.x, -crop.y);
        setDataUrl(canvas.toDataURL());
      }
    };
  }, [crop.height, crop.width, crop.x, crop.y, src]);

  return (
    <img
      src={dataUrl}
      alt={alt}
      style={style}
      data-crop={`x=${crop.x}, y=${crop.y}, width=${crop.width}, height=${crop.height}`}
    />
  );
}
