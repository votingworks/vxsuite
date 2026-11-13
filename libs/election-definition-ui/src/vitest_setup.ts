import { vi } from 'vitest';

// Mock some DOM methods that don't exist in jsdom but are required by tiptap
// (our rich text editor library).
// See https://github.com/ueberdosis/tiptap/discussions/4008
function getBoundingClientRect(): DOMRect {
  const rec = {
    x: 0,
    y: 0,
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
  } as const;
  // eslint-disable-next-line vx/gts-identifiers
  return { ...rec, toJSON: () => rec };
}

// eslint-disable-next-line vx/gts-identifiers
class FakeDOMRectList extends Array<DOMRect> implements DOMRectList {
  item(index: number): DOMRect | null {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this[index]!;
  }
}

document.elementFromPoint = (): null => null;
HTMLElement.prototype.getBoundingClientRect = getBoundingClientRect;
HTMLElement.prototype.getClientRects = (): DOMRectList => new FakeDOMRectList();
Range.prototype.getBoundingClientRect = getBoundingClientRect;
Range.prototype.getClientRects = (): DOMRectList => new FakeDOMRectList();

// Mock needed for react-flip-toolkit:
window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false }));
