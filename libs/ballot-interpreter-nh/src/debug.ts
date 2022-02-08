import { assert } from '@votingworks/utils';
import { createCanvas, createImageData } from 'canvas';
import { writeFileSync } from 'fs';
import { JSDOM } from 'jsdom';

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
  image(x: number, y: number, w: number, h: number, url: string): Debugger;

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
export function svg(rootElement: SVGElement): SvgDebugger {
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
        `Expected layer ${name} but got ${currentLayer.name}`
      );
      currentLayer = currentLayer.parent ?? root;
      return this;
    },

    image(x: number, y: number, w: number, h: number, url: string): Debugger {
      const image = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'image'
      );
      image.style.imageRendering = 'pixelated';
      image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url);
      image.setAttribute('x', `${x}`);
      image.setAttribute('y', `${y}`);
      image.setAttribute('width', `${w}`);
      image.setAttribute('height', `${h}`);
      currentLayer.element.appendChild(image);
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

const debugFilenameCounterByTestPathAndTestName = new Map<string, number>();

/**
 * Run a function with an SVG debugger, and write the result to a file.
 */
export function withSvgDebugger<T>(callback: (debug: Debugger) => T): T {
  const { document } = new JSDOM().window;
  const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const debug = svg(root);
  let result: T;
  try {
    result = callback(debug);
  } finally {
    const { testPath, currentTestName } = expect.getState();
    const key = `${testPath}/${currentTestName}`;
    const count = debugFilenameCounterByTestPathAndTestName.get(key) ?? 0;
    debugFilenameCounterByTestPathAndTestName.set(key, count + 1);
    const fileName = `${testPath}-debug-${currentTestName.replace(
      /[^-_\w]+/g,
      '-'
    )}${count === 0 ? '' : `-${count}`}.svg`;
    writeFileSync(fileName, root.outerHTML);
  }
  return result;
}
