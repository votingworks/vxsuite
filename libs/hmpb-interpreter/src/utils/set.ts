export function setMap<FromElement, ToElement>(
  set: Iterable<FromElement>,
  map: (element: FromElement) => ToElement
): Set<ToElement> {
  return new Set([...set].map(map))
}

export function setFlatMap<FromElement, ToElement>(
  set: Iterable<FromElement>,
  map: (element: FromElement) => Iterable<ToElement>
): Set<ToElement> {
  let result = new Set<ToElement>()

  for (const element of set) {
    result = setUnion(result, new Set(map(element)))
  }

  return result
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

export function setIntersect<Element>(
  first: Set<Element>,
  second: Set<Element>
): Set<Element> {
  const result = new Set<Element>()

  for (const element of first) {
    if (second.has(element)) {
      result.add(element)
    }
  }

  return result
}

export function setUnion<Element>(
  first: Set<Element>,
  second: Set<Element>
): Set<Element> {
  return new Set([...first, ...second])
}
