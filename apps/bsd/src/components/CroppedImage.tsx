import { Rect } from '@votingworks/types';
import React, { useEffect, useState } from 'react';

export interface Props {
  src: string;
  alt: string;
  crop: Rect;
  style?: React.CSSProperties;
}

export default function CroppedImage({
  src,
  alt,
  crop,
  style,
}: Props): JSX.Element {
  const [dataURL, setDataURL] = useState<string>();

  useEffect(() => {
    const image = new Image();
    image.src = src;
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = crop.width;
      canvas.height = crop.height;
      const context = canvas.getContext('2d');

      if (context) {
        context.drawImage(image, -crop.x, -crop.y);
        setDataURL(canvas.toDataURL());
      }
    };
  }, [crop.height, crop.width, crop.x, crop.y, src]);

  return <img src={dataURL} alt={alt} style={style} />;
}
