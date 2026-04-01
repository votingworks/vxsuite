import styled from 'styled-components';
import { Rect } from '@votingworks/types';
import { DesktopPalette } from './themes/make_theme';

type HighlightVariant = 'warning' | 'primary';

export interface BallotImageHighlight {
  readonly bounds: Rect;
  readonly variant: HighlightVariant;
}

export const HIGHLIGHT_WARNING_BACKGROUND = 'rgba(220, 120, 0, 0.1)';
export const HIGHLIGHT_PRIMARY_BACKGROUND = 'rgba(100, 50, 200, 0.1)';

const HIGHLIGHT_STYLES: Record<
  HighlightVariant,
  { background: string; borderColor: string }
> = {
  warning: {
    background: HIGHLIGHT_WARNING_BACKGROUND,
    borderColor: DesktopPalette.Orange30,
  },
  primary: {
    background: HIGHLIGHT_PRIMARY_BACKGROUND,
    borderColor: DesktopPalette.Purple60,
  },
};

const HighlightOverlay = styled.div<{
  top: number;
  left: number;
  width: number;
  height: number;
  variant: HighlightVariant;
}>`
  position: absolute;
  top: ${(p) => p.top}%;
  left: ${(p) => p.left}%;
  width: ${(p) => p.width}%;
  height: ${(p) => p.height}%;
  z-index: 1;
  background: ${(p) => HIGHLIGHT_STYLES[p.variant].background};
  box-shadow: 0 0 0 3px ${(p) => HIGHLIGHT_STYLES[p.variant].borderColor};
  border-radius: 2px;
  pointer-events: none;
`;

/**
 * Renders a ballot image with optional contest highlight overlays.
 */
export function BallotImage({
  imageUrl,
  ballotBounds,
  highlights,
  style = {},
}: {
  imageUrl: string;
  ballotBounds: Rect;
  highlights?: readonly BallotImageHighlight[];
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    // Use a div with a background image instead of an img tag so that no matter
    // how we scale the div, the highlights will always be positioned
    // proportionally (since they are children).
    <div
      role="img"
      aria-label="Ballot"
      style={{
        position: 'relative',
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        // Automatically scale the image to fit inside its parent, maximizing width
        aspectRatio: `${ballotBounds.width} / ${ballotBounds.height}`,
        // If the image would be longer than its parent at max width, shrink
        // it to fit to the height of its parent instead
        maxHeight: '100%',
        ...style,
      }}
    >
      {highlights?.map((highlight) => (
        <HighlightOverlay
          key={`${highlight.variant}-${highlight.bounds.x}-${highlight.bounds.y}-${highlight.bounds.width}-${highlight.bounds.height}`}
          top={(highlight.bounds.y / ballotBounds.height) * 100}
          left={(highlight.bounds.x / ballotBounds.width) * 100}
          width={(highlight.bounds.width / ballotBounds.width) * 100}
          height={(highlight.bounds.height / ballotBounds.height) * 100}
          variant={highlight.variant}
        />
      ))}
    </div>
  );
}
