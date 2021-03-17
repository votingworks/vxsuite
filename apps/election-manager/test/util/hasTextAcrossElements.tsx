import { Matcher, Nullish } from '@testing-library/react'

export default function hasTextAcrossElements(text: string): Matcher {
  return (content: string, node: Nullish<Element>) => {
    const hasText = (n: Element) => n.textContent === text
    const nodeHasText = !!node && hasText(node)
    const childrenDontHaveText = Array.from(node?.children || []).every(
      (child) => !hasText(child)
    )
    return nodeHasText && childrenDontHaveText
  }
}
