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

import { createCanvas } from 'canvas'
import chalk from 'chalk'
import { createWriteStream } from 'fs'
import lsd, { LineSegment } from '..'
import { distance, Size } from '../util/geometry'
import { readGrayscaleImage } from '../util/images'
import { adjacentFile } from '../util/path'
import { LengthThreshold, Options, parseOptions } from './options'

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
  const { minLength, scale, size, format, background } = options

  const {
    originalImageData: original,
    imageData,
    scale: actualScale,
  } = await readGrayscaleImage(imagePath, { scale, size })
  const unfilteredSegments = lsd(imageData)
  const segments = minLength
    ? unfilteredSegments.filter(
        lineSegmentPredicate(
          { width: original.width, height: original.height },
          minLength
        )
      )
    : unfilteredSegments

  if (format === 'svg') {
    const outPath = adjacentFile(imagePath, '-lsd', '.svg')
    const out = createWriteStream(outPath, 'utf8')

    await writeLineSegmentsAsSvg({
      original,
      segments,
      scale: actualScale,
      out,
      background,
    })

    return outPath
  } else {
    const outPath = adjacentFile(imagePath, '-lsd', '.png')
    const out = createWriteStream(outPath)

    await writeLineSegmentsAsPng({
      original,
      segments,
      scale: actualScale,
      out,
      background,
    })

    return outPath
  }
}

async function writeLineSegmentsAsSvg({
  original,
  segments,
  scale,
  out,
  background,
}: {
  original: ImageData
  segments: readonly LineSegment[]
  scale: number
  out: NodeJS.WritableStream
  background?: Options['background']
}): Promise<void> {
  out.write(`<?xml version="1.0" standalone="no"?>
  <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN"
  "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
  <svg width="${original.width}px" height="${original.height}px" version="1.1"
  xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"${
    background === 'white' ? ' style="background-color: white"' : ''
  }>\n`)

  if (background === 'original') {
    const canvas = createCanvas(original.width, original.height)
    const context = canvas.getContext('2d')
    context.putImageData(original, 0, 0)

    out.write(
      `<image width="${original.width}" height="${
        original.height
      }" xlink:href="${canvas.toDataURL('image/png')}" />`
    )
  }

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
      `<line x1="${x1 / scale}" y1="${y1 / scale}" x2="${x2 / scale}" y2="${
        y2 / scale
      }" stroke-width="${width / scale}" stroke="${color}" />\n`
    )
  }
  out.write(`</svg>\n`)

  await new Promise((resolve) => out.end(() => resolve(undefined)))
}

async function writeLineSegmentsAsPng({
  original,
  segments,
  scale,
  out,
  background,
}: {
  original: ImageData
  segments: readonly LineSegment[]
  scale: number
  out: NodeJS.WritableStream
  background?: Options['background']
}): Promise<void> {
  const canvas = createCanvas(original.width, original.height)
  const context = canvas.getContext('2d')

  if (background === 'original') {
    context.putImageData(original, 0, 0)
  } else if (background === 'white') {
    context.fillStyle = 'white'
    context.fillRect(0, 0, original.width, original.height)
  }

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
    context.beginPath()
    context.strokeStyle = color
    context.lineWidth = width / scale
    context.moveTo(x1 / scale, y1 / scale)
    context.lineTo(x2 / scale, y2 / scale)
    context.stroke()
  }

  await new Promise((resolve) =>
    canvas.createPNGStream().pipe(out).once('finish', resolve)
  )
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
  out.write(
    ' -f, --format FORMAT    Write output file in FORMAT, one of "svg" (default) or "png".\n'
  )
  out.write(
    ' -b, --background BG    Draw background as BG, one of "none" (default), "white", or "original".\n'
  )
  out.write('\n')
  out.write(chalk.bold('Examples\n'))
  out.write(chalk.dim('# Find segments at least 20% of the width.\n'))
  out.write('$ lsd --min-length 20%w image.png\n')
  out.write('\n')
  out.write(chalk.dim('# Scale down before searching for line segments.\n'))
  out.write('$ lsd --scale 50% image.png\n')
  out.write('\n')
  out.write(chalk.dim('# Draw line segments on top of the original image.\n'))
  out.write('$ lsd -b original image.png\n')
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
