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
exports.__esModule = true

const { default: lsd } = require('..')
const { distance } = require('../util/geometry')
const { readGrayscaleImage } = require('../util/images')
const { adjacentFile } = require('../util/path')
const { parseOptions } = require('./options')
const { createWriteStream } = require('fs')

/** @typedef {import('../util/geometry').Size} Size */
/** @typedef {import('..').LineSegment} LineSegment */

/**
 * @param {Size} imageSize
 * @param {import('../cli/options').LengthThreshold} lengthThreshold
 * @returns {(segment: LineSegment) => boolean}
 */
function lineSegmentPredicate(imageSize, lengthThreshold) {
  if (typeof lengthThreshold === 'number') {
    return (segment) =>
      distance(segment.x1, segment.y1, segment.x2, segment.y2) >=
      lengthThreshold
  } else {
    const value =
      'width' in lengthThreshold
        ? (lengthThreshold.width / 100) * imageSize.width
        : (lengthThreshold.height / 100) * imageSize.height
    return (segment) =>
      distance(segment.x1, segment.y1, segment.x2, segment.y2) >= value
  }
}

/**
 * @param {readonly string[]} args
 * @returns {Promise<void>}
 */
async function main(args) {
  const { imagePaths, minLength, scale, size } = parseOptions(args)

  for (const imagePath of imagePaths) {
    const {
      imageData,
      scale: actualScale,
    } = await readGrayscaleImage(imagePath, { scale, size })
    const unfilteredSegments = lsd(imageData)
    const segments = minLength
      ? unfilteredSegments.filter(
          lineSegmentPredicate({ ...imageData }, minLength)
        )
      : unfilteredSegments
    const outPath = adjacentFile(imagePath, '-lsd', '.svg')
    const out = createWriteStream(outPath, 'utf8')

    process.stdout.write(`📝 ${outPath}\n`)
    out.write(`<?xml version="1.0" standalone="no"?>
   <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN"
    "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
   <svg width="${Math.round(
     imageData.width / actualScale
   )}px" height="${Math.round(imageData.height / actualScale)}px" version="1.1"
    xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n`)
    for (const { x1, y1, x2, y2, width } of segments) {
      const dx = x1 - x2
      const dy = y1 - y2

      const color =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? 'red'
            : 'blue'
          : dy > 0
          ? 'green'
          : 'yellow'
      out.write(
        `<line x1="${x1 / actualScale}" y1="${y1 / actualScale}" x2="${
          x2 / actualScale
        }" y2="${y2 / actualScale}" stroke-width="${
          width / actualScale
        }" stroke="${color}" />\n`
      )
    }
    out.write(`</svg>\n`)

    await new Promise((resolve) => out.end(() => resolve(undefined)))
  }
}
exports.main = main
