const FLEX_AND_GRID_DISPLAYS = new Set([
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
]);

const BLOCKIFIED_DISPLAYS: Readonly<Record<string, string>> = {
  inline: 'block',
  'inline-block': 'block',
  'inline-flex': 'flex',
  'inline-grid': 'grid',
  'inline-table': 'table',
};

function isBlockified(
  style: CSSStyleDeclaration,
  parentStyle?: CSSStyleDeclaration
): boolean {
  return (
    style.position === 'absolute' ||
    style.position === 'fixed' ||
    (style.float !== '' && style.float !== 'none') ||
    (parentStyle !== undefined &&
      FLEX_AND_GRID_DISPLAYS.has(parentStyle.display))
  );
}

/**
 * Makes `getComputedStyle` report the blockified `display` of absolutely
 * positioned, floated, flex item, and grid item elements, as browsers do and
 * jsdom doesn't, so accessible names separate their text the way browsers do.
 * See https://github.com/jsdom/jsdom/issues/4409.
 */
export function blockifyDisplay(): void {
  const originalGetComputedStyle = globalThis.getComputedStyle.bind(globalThis);

  globalThis.getComputedStyle = (element, pseudoElement) => {
    const style = originalGetComputedStyle(element, pseudoElement);
    const blockified = BLOCKIFIED_DISPLAYS[style.display];
    const parent = element.parentElement;
    if (
      !blockified ||
      !isBlockified(
        style,
        parent ? originalGetComputedStyle(parent) : undefined
      )
    ) {
      return style;
    }

    return new Proxy(style, {
      get(target, property) {
        if (property === 'display') {
          return blockified;
        }
        if (property === 'getPropertyValue') {
          return (name: string) =>
            name === 'display' ? blockified : target.getPropertyValue(name);
        }
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  };
}
