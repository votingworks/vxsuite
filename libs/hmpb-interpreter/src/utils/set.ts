export function setMap<FromElement, ToElement>(
  set: Iterable<FromElement>,
  map: (element: FromElement) => ToElement
): Set<ToElement> {
  return new Set([...set].map(map))
}

export function setFilter<Element, FilteredElement extends Element>(
  iterable: Iterable<Element>,
  predicate: (
    element: Element,
    index: number,
    elements: readonly Element[]
  ) => element is FilteredElement
): Set<FilteredElement>
export function setFilter<Element>(
  iterable: Iterable<Element>,
  predicate: (
    element: Element,
    index: number,
    elements: readonly Element[]
  ) => boolean
): Set<Element>
export function setFilter<Element>(
  iterable: Iterable<Element>,
  predicate: (
    element: Element,
    index: number,
    elements: readonly Element[]
  ) => boolean
): Set<Element> {
  return new Set([...iterable].filter(predicate))
}
