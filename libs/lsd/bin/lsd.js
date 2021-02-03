#!/usr/bin/env node

/**
 * Copyright (C) 2021 VotingWorks
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// @ts-check

const lsd = require('..')
const { loadImage, createCanvas } = require('canvas')
const { join, basename, dirname, extname } = require('path')
const { createWriteStream } = require('fs')

/**
 * @param {string} path
 * @param {{ scale?: number }=} arg1
 * @returns {Promise<ImageData>}
 */
async function readGrayscaleImage(path, { scale = 1 } = {}) {
  const image = await loadImage(path)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(
    image,
    0,
    0,
    Math.round(image.width * scale),
    Math.round(image.height * scale)
  )
  const imageData = context.getImageData(0, 0, image.width, image.height)
  const src32 = new Int32Array(imageData.data.buffer)
  const dst = new Uint8ClampedArray(image.width * image.height)

  for (let offset = 0, size = src32.length; offset < size; offset++) {
    const px = src32[offset]
    const r = px & 0xff
    const g = (px >>> 8) & 0xff
    const b = (px >>> 16) & 0xff

    // Luminosity grayscale formula.
    const luminosity = (0.21 * r + 0.72 * g + 0.07 * b) | 0
    dst[offset] = luminosity
  }

  return {
    data: dst,
    width: imageData.width,
    height: imageData.height,
  }
}

/**
 * @param {string} path
 * @param {string} suffix
 * @param {string=} newExt
 * @returns {string}
 */
function adjacentFile(path, suffix, newExt) {
  const ext = extname(path)
  const base = basename(path, ext)
  const dir = dirname(path)

  return join(dir, base + suffix + (newExt || ext))
}

/**
 * @param {readonly string[]} args
 * @returns {Promise<void>}
 */
async function main(args) {
  for (const path of args) {
    const imageData = await readGrayscaleImage(path)
    const segments = lsd(imageData)
    const outPath = adjacentFile(path, '-lsd', '.svg')
    const out = createWriteStream(outPath, 'utf8')

    process.stdout.write(`📝 ${outPath}\n`)
    out.write(`<?xml version="1.0" standalone="no"?>
   <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN"
    "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
   <svg width="${imageData.width}px" height="${imageData.height}px" version="1.1"
    xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n`)
    for (const { x1, y1, x2, y2, width } of segments) {
      out.write(
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${width}" stroke="black" />\n`
      )
    }
    await new Promise((resolve) => out.end(`</svg>\n`, () => resolve(undefined)))
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.stack)
    process.exitCode = 1
  })
}
