import { Matcher } from '@testing-library/react';

export function hasTextAcrossElements(text: string | RegExp): Matcher {
  function matcher(content: string, node: Element | null) {
    function hasText(n: Element) {
      if (typeof text === 'string') {
        return n.textContent === text;
      }

      return text.test(n.textContent || '');
    }
    const nodeHasText = !!node && hasText(node);
    const childrenDontHaveText = Array.from(node?.children || []).every(
      (child) => !hasText(child)
    );
    return nodeHasText && childrenDontHaveText;
  }

  matcher.toString = () => `"${text}" [searching across elements]`;

  return matcher;
}
