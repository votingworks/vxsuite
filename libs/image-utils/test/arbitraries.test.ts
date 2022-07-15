import fc from 'fast-check';
import {
  GRAY_CHANNEL_COUNT,
  RGBA_CHANNEL_COUNT,
  RGB_CHANNEL_COUNT,
} from '../src';
import { assertInteger } from '../src/numeric';
import {
  arbitraryChannelCount,
  arbitraryImageData,
  arbitraryRect,
} from './arbitraries';

test('arbitraryChannelCount', () => {
  fc.assert(
    fc.property(arbitraryChannelCount(), (channels) => {
      expect(
        channels === GRAY_CHANNEL_COUNT ||
          channels === RGB_CHANNEL_COUNT ||
          channels === RGBA_CHANNEL_COUNT
      ).toBe(true);
    })
  );
});

test('arbitraryImageData has sensible values', () => {
  fc.assert(
    fc.property(arbitraryImageData(), (imageData) => {
      expect(imageData.data).toBeInstanceOf(Uint8ClampedArray);
      assertInteger(imageData.width);
      assertInteger(imageData.height);

      assertInteger(imageData.data.length / imageData.width / imageData.height);
      expect(imageData.width).toBeGreaterThanOrEqual(1);
      expect(imageData.height).toBeGreaterThanOrEqual(1);
    })
  );
});

test('arbitraryImageData can constrain width', () => {
  fc.assert(
    fc.property(arbitraryImageData({ width: 9 }), (imageData) => {
      expect(imageData.width).toBe(9);
    })
  );

  fc.assert(
    fc.property(
      arbitraryImageData({ width: fc.integer({ min: 1, max: 10 }) }),
      (imageData) => {
        expect(imageData.width).toBeGreaterThanOrEqual(1);
        expect(imageData.width).toBeLessThanOrEqual(10);
      }
    )
  );
});

test('arbitraryImageData can constrain height', () => {
  fc.assert(
    fc.property(arbitraryImageData({ height: 9 }), (imageData) => {
      expect(imageData.height).toBe(9);
    })
  );

  fc.assert(
    fc.property(
      arbitraryImageData({ height: fc.integer({ min: 1, max: 10 }) }),
      (imageData) => {
        expect(imageData.height).toBeGreaterThanOrEqual(1);
        expect(imageData.height).toBeLessThanOrEqual(10);
      }
    )
  );
});

test('arbitraryImageData can constrain channels', () => {
  fc.assert(
    fc.property(arbitraryImageData({ channels: 6 }), (imageData) => {
      expect(imageData.data.length / imageData.width / imageData.height).toBe(
        6
      );
    })
  );
});

test('arbitraryRect', () => {
  fc.assert(
    fc.property(arbitraryRect(), (rect) => {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.width).toBeGreaterThanOrEqual(1);
      expect(rect.height).toBeGreaterThanOrEqual(1);
    })
  );
});

test('arbitraryRect can constrain maximum x', () => {
  fc.assert(
    fc.property(arbitraryRect({ maxX: 9 }), (rect) => {
      expect(rect.x).toBeLessThanOrEqual(9);
    })
  );
});

test('arbitraryRect can constrain maximum y', () => {
  fc.assert(
    fc.property(arbitraryRect({ maxY: 9 }), (rect) => {
      expect(rect.y).toBeLessThanOrEqual(9);
    })
  );
});

test('arbitraryRect can constrain minimum width', () => {
  fc.assert(
    fc.property(arbitraryRect({ minWidth: 9 }), (rect) => {
      expect(rect.width).toBeGreaterThanOrEqual(9);
    })
  );

  fc.assert(
    fc.property(
      fc.nat().chain((minWidth) =>
        fc.record({
          minWidth: fc.constant(minWidth),
          rect: arbitraryRect({ minWidth: fc.constant(minWidth) }),
        })
      ),
      ({ minWidth, rect }) => {
        expect(rect.width).toBeGreaterThanOrEqual(minWidth);
      }
    )
  );
});

test('arbitraryRect can constrain minimum height', () => {
  fc.assert(
    fc.property(arbitraryRect({ minHeight: 9 }), (rect) => {
      expect(rect.height).toBeGreaterThanOrEqual(9);
    })
  );

  fc.assert(
    fc.property(
      fc.nat().chain((minHeight) =>
        fc.record({
          minHeight: fc.constant(minHeight),
          rect: arbitraryRect({ minHeight: fc.constant(minHeight) }),
        })
      ),
      ({ minHeight, rect }) => {
        expect(rect.height).toBeGreaterThanOrEqual(minHeight);
      }
    )
  );
});
