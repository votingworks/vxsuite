// https://stackoverflow.com/questions/55509875/how-to-query-by-text-string-which-contains-html-tags-using-react-testing-library

import { MatcherFunction } from '@testing-library/react'

type Query = (f: MatcherFunction) => HTMLElement

const withMarkup = (query: Query) => (text: string): HTMLElement =>
  query((content: string, node: HTMLElement) => {
    const hasText = (node: HTMLElement) => node.textContent === text
    const childrenDontHaveText = Array.from(node.children).every(
      child => !hasText(child as HTMLElement)
    )
    return hasText(node) && childrenDontHaveText
  })

export default withMarkup
