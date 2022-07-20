/* this file is for debugging during dev & test, not for production */

import { Size } from '@votingworks/types';
import { Buffer } from 'buffer';
import { createCanvas } from 'canvas';
import makeDebug, {
  enable as enableDebug,
  enabled as isDebugEnabled,
} from 'debug';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { toRgba } from './image_data';

const log = makeDebug('image-utils:debug-images');

/**
 * Provides visual debugging for code dealing with image data.
 */
export interface Debugger {
  /**
   * Determines if the debugger is enabled.
   */
  isEnabled(): boolean;

  /**
   * Calls `fn` and writes the canvas with `name` after it's done, automatically
   * taking a snapshot of the canvas and restoring it.
   */
  capture<T>(name: string, fn: (debug: Debugger) => T): T;

  /**
   * Begins a new group of debugging steps.
   */
  group(name: string): Debugger;

  /**
   * Ends the current group of debugging steps. Expects a name to ensure correct
   * nesting.
   */
  groupEnd(name: string): Debugger;

  /**
   * Save the current image data.
   */
  write(name?: string): Debugger;

  /**
   * Renders an image from a URL to the specified area.
   */
  imageData(x: number, y: number, imageData: ImageData): Debugger;

  /**
   * Renders a rectangle to the specified area.
   */
  rect(x: number, y: number, w: number, h: number, color: string): Debugger;

  /**
   * Renders a single pixel.
   */
  pixel(x: number, y: number, color: string): Debugger;

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
 * Provides callbacks for various canvas debugger operations.
 */
export interface CanvasDebuggerCallbacks {
  write(labels: readonly string[], png: Buffer): void;
}

/**
 * Creates a debugger that renders to a canvas.
 */
export function canvasDebugger(
  width: number,
  height: number,
  callbacks: CanvasDebuggerCallbacks
): Debugger {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  const snapshotStack: Array<{ name: string; imageData: ImageData }> = [];
  const groupStack: string[] = [];

  const imdebug: Debugger = {
    isEnabled: () => true,

    capture<T>(name: string, fn: (debug: Debugger) => T): T {
      snapshotStack.push({
        name,
        imageData: context.getImageData(0, 0, canvas.width, canvas.height),
      });
      imdebug.group(name);

      function restore(): void {
        imdebug.groupEnd(name);
        const lastSnapshot = snapshotStack.pop();

        /* istanbul ignore next */
        if (!lastSnapshot) {
          throw new Error(`No snapshot to restore: ${name}`);
        }

        /* istanbul ignore next */
        if (lastSnapshot.name !== name) {
          throw new Error(
            `Snapshot name mismatch: ${lastSnapshot.name} ≠ ${name}`
          );
        }

        imdebug.write(name);
        context.putImageData(lastSnapshot.imageData, 0, 0);
      }

      let result: T;

      try {
        result = fn(imdebug);
      } catch (error) {
        restore();
        throw error;
      }

      restore();
      return result;
    },

    group(name: string): Debugger {
      groupStack.push(name);
      return this;
    },

    groupEnd(name: string): Debugger {
      const lastGroup = groupStack[groupStack.length - 1];
      if (lastGroup !== name) {
        throw new Error(`Group name mismatch: ${lastGroup} ≠ ${name}`);
      }
      groupStack.pop();
      return this;
    },

    line(x1: number, y1: number, x2: number, y2: number, color: string) {
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.strokeStyle = color;
      context.stroke();
      return this;
    },

    rect(x: number, y: number, w: number, h: number, color: string) {
      context.fillStyle = color;
      context.fillRect(x, y, w, h);
      return this;
    },

    pixel(x: number, y: number, color: string) {
      context.fillStyle = color;
      context.fillRect(x, y, 1, 1);
      return this;
    },

    text(x: number, y: number, value: string, color: string) {
      context.fillStyle = color;
      context.fillText(value, x, y);
      return this;
    },

    imageData(x: number, y: number, imageData: ImageData) {
      const rgbaImageData = toRgba(imageData).unsafeUnwrap();
      context.putImageData(rgbaImageData, x, y);
      return this;
    },

    write(name: string) {
      callbacks.write([...groupStack, name], canvas.toBuffer());
      return this;
    },
  };

  return imdebug;
}

function returnThis<T>(this: T): T {
  return this;
}

/**
 * Builds a no-op debugger for passing to code with image debugging.
 */
export function noDebug(): Debugger {
  const imdebug: Debugger = {
    isEnabled: () => false,
    capture<T>(_name: string, fn: (debug: Debugger) => T): T {
      return fn(imdebug);
    },
    group: returnThis,
    groupEnd: returnThis,
    imageData: returnThis,
    line: returnThis,
    rect: returnThis,
    pixel: returnThis,
    text: returnThis,
    write: returnThis,
  };
  return imdebug;
}

/**
 * Returns an image debugger writing to images at `basePath` and with
 * `baseImage` as the initial background.
 */
export function imageDebugger(
  basePath: string,
  baseImage: ImageData,
  enabled?: boolean
): Debugger;
/**
 * Returns an image debugger writing to images at `basePath` and with
 * `size` defining the canvas size.
 */
export function imageDebugger(
  basePath: string,
  size: Size,
  enabled?: boolean
): Debugger;
/**
 * Returns an image debugger writing to images at `basePath` and with
 * either `baseImage` or `size` defining the canvas size.
 */
export function imageDebugger(
  basePath: string,
  baseImageOrSize: ImageData | Size,
  enabled = isDebugEnabled('image-utils:debug-images')
): Debugger {
  if (!enabled) {
    return noDebug();
  }

  const { width, height } = baseImageOrSize;
  let counter = 0;
  const debug = canvasDebugger(width, height, {
    write(labels, imageData) {
      const debugDirectory = `${basePath}-debug`;
      const debugFile = `${counter.toString().padStart(2, '0')}${labels
        .map((label) => `-${label}`)
        .join('')}.png`;
      const debugPath = join(debugDirectory, debugFile);
      mkdirSync(debugDirectory, { recursive: true });
      writeFileSync(debugPath, imageData);
      log(debugPath);
      counter += 1;
    },
  });

  if ((baseImageOrSize as ImageData).data) {
    debug.imageData(0, 0, baseImageOrSize as ImageData);
  }

  return debug;
}

/**
 * Enables or disables image debugging. Useful for temporarily enabling during
 * testing.
 */
export function setDebug(enabled: boolean): void {
  enableDebug(`${enabled ? '' : '-'}image-utils:debug-images`);
}
