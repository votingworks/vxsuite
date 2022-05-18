import { Matcher } from '@testing-library/react';

export function hasTextAcrossElements(text: string): Matcher {
  return (content: string, node: Element | null) => {
    function hasText(n: Element) {
      return n.textContent === text;
    }
    const nodeHasText = !!node && hasText(node);
    const childrenDontHaveText = Array.from(node?.children || []).every(
      (child) => !hasText(child)
    );
    return nodeHasText && childrenDontHaveText;
  };
}
