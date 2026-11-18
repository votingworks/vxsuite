import React from 'react';
import { assertDefined } from '@votingworks/basics';

const DURATION_MS = 200;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Returns a ref for a list container whose children slide to their new
 * positions whenever `order` changes while `enabled`.
 */
export function useReorderAnimation(
  order: readonly string[],
  enabled = true
): React.RefCallback<HTMLElement> {
  const containerRef = React.useRef<HTMLElement | null>(null);
  const previousTops = React.useRef(new Map<HTMLElement, number>());
  const previousOrderKey = React.useRef<string>();
  const orderKey = order.join(',');

  React.useLayoutEffect(() => {
    const container = assertDefined(containerRef.current);
    container.style.overflowAnchor = 'none';
    const tops = new Map(
      [...container.querySelectorAll<HTMLElement>(':scope > *')].map(
        (child) => [child, child.offsetTop]
      )
    );

    if (enabled && orderKey !== previousOrderKey.current) {
      for (const [child, top] of tops) {
        const offset = (previousTops.current.get(child) ?? top) - top;
        if (offset === 0 || prefersReducedMotion()) continue;
        child.animate(
          [{ transform: `translateY(${offset}px)` }, { transform: 'none' }],
          { duration: DURATION_MS, easing: 'ease-out' }
        );
      }
    }

    previousTops.current = tops;
    previousOrderKey.current = orderKey;
  });

  return React.useCallback((container) => {
    containerRef.current = container;
  }, []);
}
