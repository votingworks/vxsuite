import { useEffect, useRef } from 'react';
import styled from 'styled-components';
import type { CvrContest } from './types';

const OverlayCanvas = styled.canvas`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
`;

interface ScoreOverlayProps {
  readonly imageUrl: string;
  readonly contests: CvrContest[];
}

export function ScoreOverlay({
  imageUrl,
  contests,
}: ScoreOverlayProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const img = new Image();
    img.onload = () => {
      const parent = canvas.parentElement;
      if (!parent) return;

      // Match canvas to parent dimensions
      const parentRect = parent.getBoundingClientRect();
      canvas.width = parentRect.width;
      canvas.height = parentRect.height;

      // Calculate the scale and offset of the image within its container
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const containerAspect = parentRect.width / parentRect.height;

      let renderWidth: number;
      let renderHeight: number;
      let offsetX: number;
      let offsetY: number;

      if (imgAspect > containerAspect) {
        renderWidth = parentRect.width;
        renderHeight = parentRect.width / imgAspect;
        offsetX = 0;
        offsetY = (parentRect.height - renderHeight) / 2;
      } else {
        renderHeight = parentRect.height;
        renderWidth = parentRect.height * imgAspect;
        offsetX = (parentRect.width - renderWidth) / 2;
        offsetY = 0;
      }

      const scaleX = renderWidth / img.naturalWidth;
      const scaleY = renderHeight / img.naturalHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const contest of contests) {
        for (const opt of contest.options) {
          if (!opt.bounds) continue;

          const color = getOverlayColor(opt);

          const x = offsetX + opt.bounds.x * scaleX;
          const y = offsetY + opt.bounds.y * scaleY;
          const w = opt.bounds.width * scaleX;
          const h = opt.bounds.height * scaleY;

          // Draw rectangle border (3px)
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, w, h);

          // Draw score text
          ctx.fillStyle = color;
          ctx.font = 'bold 14px monospace';
          ctx.fillText(opt.score.toFixed(2), x + 4, y + 16);
        }
      }
    };
    img.src = imageUrl;
  }, [imageUrl, contests]);

  return <OverlayCanvas ref={canvasRef} />;
}

function getOverlayColor(opt: {
  hasIndication: boolean;
  isWriteIn: boolean;
  score: number;
}): string {
  if (opt.hasIndication && opt.isWriteIn) return 'rgb(0, 180, 90)';
  if (opt.hasIndication) return 'rgb(0, 120, 220)';
  if (!opt.hasIndication && opt.isWriteIn && opt.score > 0.03) return 'rgb(220, 130, 0)';
  if (!opt.hasIndication && opt.isWriteIn) return 'rgb(180, 60, 60)';
  return 'rgb(130, 130, 130)';
}
