import { useEffect } from 'react';

/* istanbul ignore next */
let baseTitle: string | undefined | null =
  document.getElementsByTagName('title')[0]?.textContent;

/**
 * Sets the base title to append to titles set by `useTitle`.
 */
export function setBaseTitle(title?: string | null): void {
  baseTitle = title;
}

/**
 * Tracks the timeout for resetting the document title to the base title.
 * Shared across all instances of `useTitle` to allow one to cancel the reset
 * when another updates the title.
 */
let resetToBaseTitleTimeout: ReturnType<typeof setTimeout> | undefined;

/**
 * Reset the document title to the base title after a short delay
 * to avoid flickering when the title is updated in quick succession.
 */
function resetToBaseTitle() {
  /* istanbul ignore next */
  document.title = baseTitle ?? '';
}

/**
 * Set the document title while the component is mounted, prepending it to the
 * base title (which defaults to being extracted from the `<title>` tag).
 *
 * NOTE: In React 19, components can simply render a `<title>` element to set
 * the document title. This hook is only useful for React 18 and below.
 *
 * @example
 *
 * ```tsx
 * // Assuming the base title is "My Site"
 * function MyComponent() {
 *   // Sets the document title to "My Page – My Site"
 *   useTitle('My Page');
 *   return <div>My content</div>;
 * }
 * ```
 *
 *
 * ```tsx
 * // Assuming the base title is "My Site"
 * function MyComponent() {
 *   // Sets the document title to "My Page – Resource Name – My Site"
 *   useTitle('My Page', 'Resource Name');
 *   return <div>My content</div>;
 * }
 * ```
 */
export function useTitle(
  ...titleParts: ReadonlyArray<string | null | undefined>
): void {
  const title = [...titleParts, baseTitle].filter((part) => part).join(' – ');

  useEffect(() => {
    if (resetToBaseTitleTimeout) {
      // Cancel any pending title reset so we can set it now.
      clearTimeout(resetToBaseTitleTimeout);
      resetToBaseTitleTimeout = undefined;
    }
    document.title = title;
    return () => {
      // Reset the document title to the base title after a short delay
      // to avoid flickering when the title is updated in quick succession.
      resetToBaseTitleTimeout = setTimeout(resetToBaseTitle, 100);
    };
  }, [title]);
}
