import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from 'vitest';
import matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';

import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';

import { TextEncoder } from 'node:util';
import { makeIdFactory } from './id_helpers';

expect.extend(matchers);

// Deterministic ID generation
const idFactory = makeIdFactory();

beforeEach(() => {
  idFactory.reset();
});

afterEach(cleanup);

vi.mock(import('nanoid'), () => ({
  customAlphabet: () => () => idFactory.next(),
}));

global.TextEncoder = TextEncoder;

URL.createObjectURL = vi.fn();

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
    return this[index];
  }
}

document.elementFromPoint = (): null => null;
HTMLElement.prototype.getBoundingClientRect = getBoundingClientRect;
HTMLElement.prototype.getClientRects = (): DOMRectList => new FakeDOMRectList();
Range.prototype.getBoundingClientRect = getBoundingClientRect;
Range.prototype.getClientRects = (): DOMRectList => new FakeDOMRectList();

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
