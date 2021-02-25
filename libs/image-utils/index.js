// @ts-check

const { strict: assert } = require('assert')

/**
 * @typedef {object} Addon
 * @property {(src: Uint8ClampedArray | Uint8Array, srcWidth: number, srcHeight: number, dst: Uint8ClampedArray | Uint8Array, dstWidth: number, dstHeight: number) => number} resize
 * @property {(src: Uint8ClampedArray | Uint8Array, srcWidth: number, srcHeight: number, dst: Uint8ClampedArray | Uint8Array, dstWidth: number, dstHeight: number, background: number) => number} grayscale
 */

/** @type {Addon} */
const addon = require('bindings')('addon')

/**
 * @param {unknown} imageData
 * @returns {asserts imageData is ImageData}
 */
function assertImageData(imageData) {
  assert(imageData && typeof imageData === 'object')
  assert(
    'data' in imageData &&
    ArrayBuffer.isView(imageData['data']),
    'expected data to be a byte array'
  )
  assert(
    'width' in imageData &&
    imageData['width'] >= 1 && (imageData['width'] | 0) === imageData['width'],
    'expected width to be a positive integer'
  )
  assert(
    'height' in imageData &&
    imageData['height'] >= 1 && (imageData['height'] | 0) === imageData['height'],
    'expected height to be a positive integer'
  )
}
exports.assertImageData = assertImageData

/**
 * @param {ImageData} imageData
 * @returns {number}
 */
function getChannelCount(imageData) {
  return imageData.data.length / (imageData.width * imageData.height)
}
exports.getChannelCount = getChannelCount

/**
 * @param {ImageData} src
 * @param {ImageData} dst
 */
function resize(src, dst) {
  assertImageData(src)
  assertImageData(dst)
  assert.equal(getChannelCount(src), getChannelCount(dst))
  addon.resize(
    src.data,
    src.width,
    src.height,
    dst.data,
    dst.width,
    dst.height
  )
}
exports.resize = resize

/**
 * @param {ImageData} src
 * @param {ImageData} dst
 * @param {{ background?: number }=} options
 */
function grayscale(src, dst, { background = 0xff } = {}) {
  assertImageData(src)
  assertImageData(dst)
  assert.equal(getChannelCount(src), 4)
  assert.equal(getChannelCount(dst), 1)
  addon.grayscale(
    src.data,
    src.width,
    src.height,
    dst.data,
    dst.width,
    dst.height,
    background
  )
}
exports.grayscale = grayscale
