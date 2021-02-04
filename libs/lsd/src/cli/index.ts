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

import lsd, { LineSegment } from '..'
import chalk from 'chalk'
import { distance, Size } from '../util/geometry'
import { readGrayscaleImage } from '../util/images'
import { adjacentFile } from '../util/path'
import { parseOptions, LengthThreshold, Options } from './options'
import { createWriteStream } from 'fs'

function lineSegmentPredicate(
  imageSize: Size,
  lengthThreshold: LengthThreshold
): (segment: LineSegment) => boolean {
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

export async function processFile(
  imagePath: string,
  options: Options
): Promise<string> {
  const { minLength, scale, size } = options

  const {
    imageData,
    scale: actualScale,
    originalSize,
  } = await readGrayscaleImage(imagePath, { scale, size })
  const unfilteredSegments = lsd(imageData)
  const segments = minLength
    ? unfilteredSegments.filter(lineSegmentPredicate(originalSize, minLength))
    : unfilteredSegments
  const outPath = adjacentFile(imagePath, '-lsd', '.svg')
  const out = createWriteStream(outPath, 'utf8')

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

  return outPath
}

function printHelp(out: NodeJS.WritableStream): void {
  out.write(
    `lsd ${chalk.italic('[OPTIONS]')} IMAGE ${chalk.italic('[IMAGE …]')}\n`
  )
  out.write('\n')
  out.write(chalk.bold('Description\n'))
  out.write('Find line segments in an image and write the result to a file.\n')
  out.write('\n')
  out.write(chalk.bold('Options\n'))
  out.write(' -h, --help             Show this help.\n')
  out.write(
    '     --min-length N     Filter line segments shorter than N pixels.\n'
  )
  out.write(
    '     --min-length N%w   Filter line segments shorter than N% of the image width.\n'
  )
  out.write(
    '     --min-length N%h   Filter line segments shorter than N% of the image height.\n'
  )
  out.write(
    '     --scale N          Resize the image before finding line segments.\n'
  )
  out.write(
    '                        If your results have segments broken up into small chunks,\n'
  )
  out.write(
    '                        try setting this to 80% or less to improve the results.\n'
  )
  out.write(
    '                        N can be a number (e.g. "0.75") or a percentage (e.g. "75%").\n'
  )
  out.write('\n')
  out.write(chalk.bold('Examples\n'))
  out.write(chalk.dim('# Find segments at least 20% of the width.\n'))
  out.write('$ lsd --min-length 20%w image.png\n')
  out.write('\n')
  out.write(chalk.dim('# Scale down before searching for line segments.\n'))
  out.write('$ lsd --scale 50% image.png\n')
}

export async function main(
  args: readonly string[],
  stdout: NodeJS.WritableStream | undefined = process.stdout
): Promise<void> {
  const options = parseOptions(args)

  if (options.help) {
    printHelp(stdout)
  } else {
    for (const imagePath of options.imagePaths) {
      const outPath = await processFile(imagePath, options)
      stdout.write(`📝 ${outPath}\n`)
    }
  }
}
