import { inGroupsOf } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { createImageData, loadImage } from 'canvas';
import { fileSync } from 'tmp';
import * as debug from 'debug';
import { stat } from 'fs/promises';
import { canvasDebugger, imageDebugger, noDebug, setDebug } from './debug';
import { toImageData } from './image_data';

test('canvas debug', async () => {
  const writeFn = jest.fn();
  const imdebug = canvasDebugger(1, 1, {
    write: writeFn,
  });

  expect(imdebug.isEnabled()).toEqual(true);

  // explicitly write image
  imdebug.write('test');

  expect(writeFn).toHaveBeenNthCalledWith(1, ['test'], expect.any(Buffer));
  {
    const imageData = toImageData(await loadImage(writeFn.mock.calls[0][1]));
    expect(imageData.width).toEqual(1);
    expect(imageData.height).toEqual(1);
    expect(imageData.data.length).toEqual(4);
  }

  // write image after capture callback
  expect(
    imdebug.capture('return capture', () => {
      imdebug.rect(0, 0, 1, 1, '#ff0000');
      return 1;
    })
  ).toEqual(1);

  expect(writeFn).toHaveBeenNthCalledWith(
    2,
    ['return capture'],
    expect.any(Buffer)
  );

  // write image even after capture throws
  expect(() =>
    imdebug.capture('throw capture', () => {
      imdebug.rect(0, 0, 1, 1, '#ff0000');
      throw new Error('test error');
    })
  ).toThrow('test error');

  expect(writeFn).toHaveBeenNthCalledWith(
    3,
    ['throw capture'],
    expect.any(Buffer)
  );
});

test('canvas debug group', () => {
  const writeFn = jest.fn();
  const imdebug = canvasDebugger(1, 1, {
    write: writeFn,
  });

  imdebug.group('test');
  imdebug.groupEnd('test');

  expect(writeFn).not.toHaveBeenCalled();

  imdebug.group('test');
  expect(() => imdebug.groupEnd('not test')).toThrow();
});

test('line', async () => {
  const writeFn = jest.fn();
  const imdebug = canvasDebugger(10, 10, {
    write: writeFn,
  });

  imdebug.line(0, 0, 9, 9, '#ff0000');

  imdebug.write('test');
  expect(writeFn).toHaveBeenNthCalledWith(1, ['test'], expect.any(Buffer));
  {
    const imageData = toImageData(await loadImage(writeFn.mock.calls[0][1]));
    expect([...imageData.data.slice(0, 3)]).toEqual([255, 0, 0]);
  }
});

test('pixel', async () => {
  const writeFn = jest.fn();
  const width = 10;
  const height = 10;
  const imdebug = canvasDebugger(width, height, {
    write: writeFn,
  });

  const x = 5;
  const y = 5;
  imdebug.pixel(x, y, '#ff0000');

  imdebug.write('test');
  expect(writeFn).toHaveBeenNthCalledWith(1, ['test'], expect.any(Buffer));

  const imageData = toImageData(await loadImage(writeFn.mock.calls[0][1]));
  expect([
    ...imageData.data.slice((y * width + x) * 4, (y * width + x) * 4 + 3),
  ]).toEqual([255, 0, 0]);
});

test('text', async () => {
  const writeFn = jest.fn();
  const width = 10;
  const height = 10;
  const imdebug = canvasDebugger(width, height, {
    write: writeFn,
  });

  const x = 5;
  const y = 5;
  imdebug.text(x, y, 'test', '#ff0000');

  imdebug.write('test');
  expect(writeFn).toHaveBeenNthCalledWith(1, ['test'], expect.any(Buffer));

  const imageData = toImageData(await loadImage(writeFn.mock.calls[0][1]));
  const countRed = [...inGroupsOf(imageData.data, 4)].reduce(
    (acc, [r, g = 0, b = 0]) => (r > 200 && g < 200 && b < 200 ? acc + 1 : acc),
    0
  );
  expect(countRed).toBeGreaterThanOrEqual(1);
});

test('imageData', async () => {
  const writeFn = jest.fn();
  const width = 10;
  const height = 10;
  const imdebug = canvasDebugger(width, height, {
    write: writeFn,
  });

  imdebug.imageData(
    0,
    0,
    createImageData(Uint8ClampedArray.of(255, 0, 0, 255), 1, 1)
  );

  imdebug.write('test');
  expect(writeFn).toHaveBeenNthCalledWith(1, ['test'], expect.any(Buffer));
  const imageData = toImageData(await loadImage(writeFn.mock.calls[0][1]));
  expect([...imageData.data.slice(0, 4)]).toEqual([255, 0, 0, 255]);
});

test('imageData with non-ImageData object', async () => {
  const writeFn = jest.fn();
  const width = 10;
  const height = 10;
  const imdebug = canvasDebugger(width, height, {
    write: writeFn,
  });

  imdebug.imageData(0, 0, {
    data: Uint8ClampedArray.of(255, 0, 0, 255),
    width: 1,
    height: 1,
  });

  imdebug.write('test');
  expect(writeFn).toHaveBeenNthCalledWith(1, ['test'], expect.any(Buffer));
  const imageData = toImageData(await loadImage(writeFn.mock.calls[0][1]));
  expect([...imageData.data.slice(0, 4)]).toEqual([255, 0, 0, 255]);
});

test('noDebug', () => {
  const imdebug = noDebug();

  imdebug.group('test').groupEnd('test');
  expect(imdebug.isEnabled()).toEqual(false);
  expect(imdebug.capture('test', () => 1)).toEqual(1);
});

test('imageDebugger returns noDebug when disabled', () => {
  const tmp = fileSync().name;
  const imdebug = imageDebugger(tmp, createImageData(1, 1), false);
  expect(imdebug.isEnabled()).toEqual(false);
});

test('imageDebugger returns canvasDebugger when enabled', () => {
  const tmp = fileSync().name;
  const imdebug = imageDebugger(tmp, createImageData(1, 1), true);
  expect(imdebug.isEnabled()).toEqual(true);
});

test('imageDebugger is enabled when image-utils:debug-images is enabled', () => {
  const wasEnabled = debug.enabled('image-utils:debug-images');

  debug.enable('image-utils:debug-images');
  try {
    expect(
      imageDebugger(fileSync().name, createImageData(1, 1)).isEnabled()
    ).toEqual(true);
  } finally {
    debug.enable('-image-utils:debug-images');
  }

  expect(
    imageDebugger(fileSync().name, createImageData(1, 1)).isEnabled()
  ).toEqual(false);

  debug.enable(`${wasEnabled ? '' : '-'}image-utils:debug-images`);
});

test('imageDebugger writes to a directory named for the base path', async () => {
  const tmp = fileSync().name;
  const imdebug = imageDebugger(tmp, createImageData(1, 1), true);
  imdebug.write('test');
  imdebug.write('another');
  expect((await stat(`${tmp}-debug`)).isDirectory()).toEqual(true);
  expect((await stat(`${tmp}-debug/00-test.png`)).isFile()).toEqual(true);
  expect((await stat(`${tmp}-debug/01-another.png`)).isFile()).toEqual(true);
});

test('setEnabled configures image-utils:debug-images enabled state', () => {
  const wasEnabled = debug.enabled('image-utils:debug-images');

  try {
    setDebug(false);
    expect(debug.enabled('image-utils:debug-images')).toEqual(false);

    setDebug(true);
    expect(debug.enabled('image-utils:debug-images')).toEqual(true);
  } finally {
    setDebug(wasEnabled);
  }
});
