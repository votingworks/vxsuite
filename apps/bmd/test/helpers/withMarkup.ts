// https://stackoverflow.com/questions/55509875/how-to-query-by-text-string-which-contains-html-tags-using-react-testing-library

import { MatcherFunction, Nullish } from '@testing-library/react';

type Query<T> = (f: MatcherFunction) => T;

function hasText(text: string, node: HTMLElement) {
  return node.textContent === text;
}

function withMarkup<T>(query: Query<T>) {
  return (text: string): T =>
    query((content: string, node: Nullish<Element>) => {
      if (!node || !(node instanceof HTMLElement)) return false;
      const childrenDontHaveText = Array.from(node.children).every(
        (child) => !hasText(text, child as HTMLElement)
      );
      return hasText(text, node) && childrenDontHaveText;
    });
}

export default withMarkup;
