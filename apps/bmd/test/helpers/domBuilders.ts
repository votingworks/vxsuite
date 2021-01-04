/**
 * Builds a text node with the given text content.
 */
export function text(data: string): Text {
  return document.createTextNode(data)
}

export type CreatableElementType = Parameters<
  typeof document['createElement']
>[0]

export interface Attributes {
  [key: string]: string
}

/**
 * Builds an element with tag name `type` and child nodes. This is similar to
 * building with JSX except it builds real DOM nodes.
 *
 * @example
 *
 * element(
 *   'p',
 *   text('hello world!')
 * )
 */
function element(
  type: CreatableElementType,
  ...children: Node[]
): ReturnType<typeof document['createElement']>

/**
 * Builds an element with tag name `type`, whatever attributes the element
 * should have, and child nodes. This is similar to building with JSX except it
 * builds real DOM nodes.
 *
 * @example
 *
 * element(
 *   'p',
 *   { id: 'the-paragraph' },
 *   text('hello world!')
 * )
 */
function element(
  type: CreatableElementType,
  attributes: { [key: string]: string },
  ...children: Node[]
): ReturnType<typeof document['createElement']>

/**
 * Builds an element with tag name `type`, whatever attributes the element
 * should have, and child nodes. This is similar to building with JSX except it
 * builds real DOM nodes.
 *
 * @example
 *
 * element(
 *   'p',
 *   { id: 'the-paragraph' },
 *   text('hello world!')
 * )
 */
function element(
  type: CreatableElementType,
  ...rest: unknown[]
): ReturnType<typeof document['createElement']> {
  const result = document.createElement(type)
  let attributes: Attributes
  let children: Node[]

  if (rest[0] instanceof Node) {
    attributes = {}
    children = rest as Node[]
  } else {
    attributes = rest[0] as Attributes
    children = rest.slice(1) as Node[]
  }

  for (const key in attributes) {
    if (Object.prototype.hasOwnProperty.call(attributes, key)) {
      result.setAttribute(key, attributes[key])
    }
  }

  result.append(...children)

  return result
}

export { element }
