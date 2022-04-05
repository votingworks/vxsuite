/* istanbul ignore file - this file is for debugging during dev & test, not for production */

import { safeParseInt } from '@votingworks/types';
import { assert } from '@votingworks/utils';
import { DOMParser } from '@xmldom/xmldom';
import { Canvas, createCanvas, createImageData } from 'canvas';
import { writeFileSync } from 'fs';

/**
 * Provides visual debugging for code dealing with image data.
 */
export interface Debugger {
  /**
   * Begins a layer, analogous to `console.group`.
   */
  layer(name: string): Debugger;

  /**
   * Ends a layer, analogous to `console.groupEnd`.
   */
  layerEnd(name: string): Debugger;

  /**
   * Renders an image from a URL to the specified area.
   */
  imageData(x: number, y: number, imageData: ImageData): Debugger;

  /**
   * Renders a rectangle to the specified area.
   */
  rect(x: number, y: number, w: number, h: number, color: string): Debugger;

  /**
   * Renders a line to the specified area.
   */
  line(x1: number, y1: number, x2: number, y2: number, color: string): Debugger;

  /**
   * Renders text to the specified area.
   */
  text(x: number, y: number, value: string, color: string): Debugger;
}

/**
 * Represents a debugger that renders SVG.
 */
export interface SvgDebugger extends Debugger {
  getRootLayer(): SvgLayer;
}

/**
 * Represents a layer in a debugger wrapping an SVG element.
 */
export interface SvgLayer {
  readonly name: string;
  readonly parent?: SvgLayer;
  readonly children: SvgLayer[];
  readonly element: SVGElement;
}

function toRgba(imageData: ImageData): ImageData {
  if (imageData.data.length / (imageData.width * imageData.height) === 4) {
    return imageData;
  }

  const data = new Uint8ClampedArray(imageData.data.length * 4);
  for (
    let sourceIndex = 0, destIndex = 0;
    sourceIndex < imageData.data.length;
    sourceIndex += 1, destIndex += 4
  ) {
    const lum = imageData.data[sourceIndex] as number;
    data[destIndex] = lum;
    data[destIndex + 1] = lum;
    data[destIndex + 2] = lum;
    data[destIndex + 3] = 255;
  }
  return createImageData(data, imageData.width, imageData.height);
}

function toJpeg(imageData: ImageData): Buffer {
  const canvas = createCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(toRgba(imageData), 0, 0);
  return canvas.toBuffer('image/jpeg');
}

/**
 * Builds a debugger that renders SVG.
 */
export function svgDebugger(rootElement: SVGElement): SvgDebugger {
  const document = rootElement.ownerDocument;
  const root: SvgLayer = {
    name: 'root',
    children: [],
    element: rootElement,
  };
  let currentLayer: SvgLayer = root;

  return {
    getRootLayer() {
      return root;
    },

    layer(name: string): Debugger {
      const layer: SvgLayer = {
        name,
        children: [],
        parent: currentLayer,
        element: document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
      };
      layer.element.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      layer.element.setAttribute('style', '/* display: none */');
      currentLayer.children.push(layer);
      currentLayer.element.appendChild(
        document.createComment(`layer: ${name}`)
      );
      currentLayer.element.appendChild(layer.element);
      currentLayer = layer;
      return this;
    },

    layerEnd(name: string): Debugger {
      assert(
        currentLayer.name === name,
        `Expected layer '${currentLayer.name}' but got '${name}'`
      );
      currentLayer = currentLayer.parent ?? root;
      return this;
    },

    imageData(x: number, y: number, imageData: ImageData): Debugger {
      const image = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'image'
      );
      image.style.imageRendering = 'pixelated';
      image.setAttributeNS(
        'http://www.w3.org/1999/xlink',
        'href',
        `data:image/jpeg;base64,${toJpeg(imageData).toString('base64')}`
      );
      image.setAttribute('x', `${x}`);
      image.setAttribute('y', `${y}`);
      image.setAttribute('width', `${imageData.width}`);
      image.setAttribute('height', `${imageData.height}`);
      currentLayer.element.appendChild(image);
      currentLayer.element.setAttribute(
        'width',
        `${Math.max(
          safeParseInt(
            currentLayer.element.getAttribute('width') ?? '0'
          ).unsafeUnwrap(),
          x + imageData.width
        )}`
      );
      currentLayer.element.setAttribute(
        'height',
        `${Math.max(
          safeParseInt(
            currentLayer.element.getAttribute('height') ?? '0'
          ).unsafeUnwrap(),
          y + imageData.height
        )}`
      );
      return this;
    },

    rect(x: number, y: number, w: number, h: number, color: string): Debugger {
      const rect = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'rect'
      );
      rect.setAttribute('x', `${x}`);
      rect.setAttribute('y', `${y}`);
      rect.setAttribute('width', `${w}`);
      rect.setAttribute('height', `${h}`);
      rect.setAttribute('fill', color);
      currentLayer.element.appendChild(rect);
      return this;
    },

    line(
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      color: string
    ): Debugger {
      const line = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'line'
      );
      line.setAttribute('x1', `${x1}`);
      line.setAttribute('y1', `${y1}`);
      line.setAttribute('x2', `${x2}`);
      line.setAttribute('y2', `${y2}`);
      line.setAttribute('stroke', color);
      currentLayer.element.appendChild(line);
      return this;
    },

    text(x: number, y: number, value: string, color: string): Debugger {
      const text = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'text'
      );
      text.setAttribute('x', `${x}`);
      text.setAttribute('y', `${y}`);
      text.setAttribute('fill', color);
      text.textContent = value;
      currentLayer.element.appendChild(text);
      return this;
    },
  };
}

interface CanvasDebugger extends Debugger {
  toBuffer(): Buffer;
}

interface CanvasLayer {
  readonly name: string;
  readonly parent?: CanvasLayer;
  readonly canvas: Canvas;
  readonly context: CanvasRenderingContext2D;
}

/**
 * Provides callbacks for various canvas debugger operations.
 */
export interface CanvasDebuggerCallbacks {
  makeCanvas(): Canvas;
  onLayerEnd(canvasLayer: CanvasLayer): void;
}

/**
 * Creates a debugger that renders to a canvas.
 */
export function canvasDebugger(
  callbacks: CanvasDebuggerCallbacks
): CanvasDebugger {
  const rootCanvas = callbacks.makeCanvas();
  const rootContext = rootCanvas.getContext('2d');
  const rootLayer: CanvasLayer = {
    name: 'root',
    canvas: rootCanvas,
    context: rootContext,
  };
  const layers: CanvasLayer[] = [rootLayer];

  return {
    line(x1: number, y1: number, x2: number, y2: number, color: string) {
      for (const { context } of layers) {
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.strokeStyle = color;
        context.stroke();
      }
      return this;
    },

    rect(x: number, y: number, w: number, h: number, color: string) {
      for (const { context } of layers) {
        context.fillStyle = color;
        context.fillRect(x, y, w, h);
      }
      return this;
    },

    text(x: number, y: number, value: string, color: string) {
      for (const { context } of layers) {
        context.fillStyle = color;
        context.fillText(value, x, y);
      }
      return this;
    },

    imageData(x: number, y: number, imageData: ImageData) {
      for (const { context } of layers) {
        context.putImageData(toRgba(imageData), x, y);
      }
      return this;
    },

    layer(name: string): CanvasDebugger {
      const currentLayer = layers[layers.length - 1] ?? rootLayer;
      const newLayerCanvas = callbacks.makeCanvas();
      const newLayerContext = newLayerCanvas.getContext('2d');
      newLayerContext.drawImage(currentLayer.canvas, 0, 0);
      layers.push({
        name,
        parent: currentLayer,
        canvas: newLayerCanvas,
        context: newLayerContext,
      });
      return this;
    },

    layerEnd(name: string): CanvasDebugger {
      const currentLayer = layers.pop();
      if (currentLayer?.name !== name) {
        throw new Error(
          `expected layer ${name} but got ${currentLayer?.name ?? 'none'}`
        );
      }
      callbacks.onLayerEnd(currentLayer);
      return this;
    },

    toBuffer(): Buffer {
      return rootCanvas.toBuffer();
    },
  };
}

let debugEnabled = false;
const debugFilenameCounterByTestPathAndTestName = new Map<string, number>();

function returnThis<T>(this: T): T {
  return this;
}

/**
 * Builds a no-op debugger for passing to code with image debugging.
 */
export function noDebug(): Debugger {
  return {
    layer: returnThis,
    layerEnd: returnThis,
    imageData: returnThis,
    line: returnThis,
    rect: returnThis,
    text: returnThis,
  };
}

/**
 * Enables or disables the SVG debugger.
 */
export function setDebug(newDebugEnabled: boolean): void {
  debugEnabled = newDebugEnabled;
}

function getCurrentTestPath(): string {
  const { testPath, currentTestName } = expect.getState();
  const key = `${testPath}/${currentTestName}`;
  const count = debugFilenameCounterByTestPathAndTestName.get(key) ?? 0;
  debugFilenameCounterByTestPathAndTestName.set(key, count + 1);
  return `${testPath}-debug-${currentTestName.replace(
    /[^-_\w]+/g,
    '-'
  )}-${count}`;
}

/**
 * Run a function with an SVG debugger, and write the result to a file.
 */
export function withSvgDebugger<T>(callback: (debug: Debugger) => T): T;

/**
 * Run a function with an SVG debugger, and write the result to the given file.
 */
export function withSvgDebugger<T>(
  fileName: string,
  callback: (debug: Debugger) => T
): T;

/**
 * Run a function with an SVG debugger, and write the result to a file.
 */
export function withSvgDebugger<T>(
  fileNameOrCallback: string | ((debug: Debugger) => T),
  callbackOrNothing?: (debug: Debugger) => T
): T {
  if (
    typeof fileNameOrCallback === 'function' &&
    typeof callbackOrNothing === 'undefined'
  ) {
    const callback = fileNameOrCallback;
    const fileName = `${getCurrentTestPath()}.svg`;

    if (!debugEnabled) {
      return callback(noDebug());
    }

    return withSvgDebugger(fileName, callback);
  }

  assert(
    typeof fileNameOrCallback === 'string' &&
      typeof callbackOrNothing === 'function'
  );

  const fileName = fileNameOrCallback;
  const callback = callbackOrNothing;
  const document = new DOMParser().parseFromString(
    '<svg></svg>',
    'image/svg+xml'
  );
  const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const debug = svgDebugger(root);
  let result: T;
  try {
    result = callback(debug);
    if (result && 'then' in result) {
      return (result as unknown as Promise<unknown>).then(
        () => {
          writeFileSync(fileName, root.toString());
          return result;
        },
        (error) => {
          writeFileSync(fileName, root.toString());
          throw error;
        }
      ) as unknown as T;
    }
  } finally {
    writeFileSync(fileName, root.toString());
  }
  return result;
}

/**
 * Run a function with a canvas debugger, and write the result to a file.
 */
export function withCanvasDebugger<T>(
  width: number,
  height: number,
  callback: (debug: Debugger) => Promise<T>
): Promise<T>;
/**
 * Run a function with a canvas debugger, and write the result to a file.
 */
export function withCanvasDebugger<T>(
  width: number,
  height: number,
  callback: (debug: Debugger) => T
): T;
/**
 * Run a function with a canvas debugger, and write the result to a file.
 */
export function withCanvasDebugger<T>(
  width: number,
  height: number,
  callback: (debug: Debugger) => T
): T {
  if (!debugEnabled) {
    return callback(noDebug());
  }

  const fileNameRoot = getCurrentTestPath();
  const fileName = `${fileNameRoot}.png`;
  const debug = canvasDebugger({
    makeCanvas() {
      return createCanvas(width, height);
    },

    onLayerEnd(layer) {
      let layerFileName = '';
      for (
        let parentLayer = layer;
        parentLayer.parent;
        parentLayer = parentLayer.parent
      ) {
        layerFileName = `${parentLayer.name}--${layerFileName}`;
      }
      writeFileSync(
        `${fileNameRoot}--${layerFileName}.png`,
        layer.canvas.toBuffer()
      );
    },
  });
  let result: T;

  try {
    result = callback(debug);
    if (result && 'then' in result) {
      return (result as unknown as Promise<unknown>).then(
        () => {
          writeFileSync(fileName, debug.toBuffer());
          return result;
        },
        (error) => {
          writeFileSync(fileName, debug.toBuffer());
          throw error;
        }
      ) as unknown as T;
    }
  } finally {
    writeFileSync(fileName, debug.toBuffer());
  }
  return result;
}
