import { parseElection } from '@votingworks/ballot-encoder'
import { strict as assert } from 'assert'
import chalk from 'chalk'
import { promises as fs } from 'fs'
import { inspect } from 'util'
import { GlobalOptions, OptionParseError } from '..'
import { Interpreter } from '../..'
import { writeImageToFile } from '../../../test/utils'
import { findMatchingContests } from '../../hmpb/findContests'
import { detect } from '../../metadata'
import { Point, Rect } from '../../types'
import { binarize, RGBA } from '../../utils/binarize'
import { vh } from '../../utils/flip'
import { lineSegmentPixels } from '../../utils/geometry'
import { getImageChannelCount } from '../../utils/imageFormatUtils'
import { loadImageData } from '../../utils/images'
// import { makeDebugImageLogger } from '../../utils/logging'
import { adjacentFile } from '../../utils/path'
import * as z from 'zod'

export enum Format {
  PNG = 'png',
  HTML = 'html',
}

// Generic
type StringEnum = {
  [key: string]: string
}

function schemaForEnum<T extends StringEnum, K extends string = T[keyof T]>(
  enumeration: T
): z.ZodEnum<[K, ...K[]]> {
  return z.enum<K, [K, ...K[]]>(Object.values(enumeration) as [K, ...K[]])
}

export const FormatSchema = schemaForEnum(Format)

export interface Options {
  format?: Format
  electionPath: string
  templateImagePaths: readonly string[]
  ballotImagePaths: readonly string[]
}

const RGBA_CHANNELS = 4
const RED_OVERLAY_COLOR: RGBA = [0xff, 0, 0, 0x60]
const GREEN_OVERLAY_COLOR: RGBA = [0, 0xff, 0, 0x60]

export const name = 'layout'
export const description = 'Annotate the interpreted layout of a ballot page'

export function printHelp($0: string, out: NodeJS.WritableStream): void {
  out.write(`${$0} layout -e ELECTION -t TEMPLATE BALLOT1 [BALLOT2 …]\n`)
  out.write(`\n`)
  out.write(chalk.italic(`Examples\n`))
  out.write(`\n`)
  out.write(chalk.gray(`# Annotate layout for a single ballot page.\n`))
  out.write(`${$0} layout -e election.json -t template-p1.png ballot01.png\n`)
  out.write(`\n`)
  out.write(chalk.gray(`# Annotate layout for many ballot pages.\n`))
  out.write(`${$0} layout -e election.json -t template-p1.png ballot*.png\n`)
}

export async function parseOptions({
  commandArgs: args,
}: GlobalOptions): Promise<Options> {
  const templateImagePaths: string[] = []
  const ballotImagePaths: string[] = []
  let electionPath: string | undefined
  let format: Format | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-e' || arg === '--election') {
      electionPath = args[++i]
      if (!electionPath || electionPath.startsWith('-')) {
        throw new Error(
          `expected election path after ${arg} but got ${
            electionPath ?? 'nothing'
          }`
        )
      }
    } else if (arg === '-t' || arg === '--template') {
      const templateImagePath = args[++i]
      if (!templateImagePath || templateImagePath.startsWith('-')) {
        throw new Error(
          `expected template image path after ${arg} but got ${
            templateImagePath ?? 'nothing'
          }`
        )
      }
      templateImagePaths.push(templateImagePath)
    } else if (arg === '-f' || arg === '--format') {
      const value = args[++i]
      if (FormatSchema.check(value)) {
        format = value
      } else {
        throw new Error(
          `expected format after ${arg} but got ${value ?? 'nothing'}`
        )
      }
    } else if (arg.startsWith('-')) {
      throw new OptionParseError(`unexpected option passed to 'layout': ${arg}`)
    } else {
      ballotImagePaths.push(arg)
    }
  }

  if (!electionPath) {
    throw new Error('missing required option: --election')
  }

  return { format, electionPath, templateImagePaths, ballotImagePaths }
}

/**
 * Finds features in an image and writes an image adjacent with overlays marking
 * those features.
 */
export async function run(
  options: Options,
  _stdin: NodeJS.ReadableStream,
  stdout: NodeJS.WritableStream
): Promise<number> {
  const election = parseElection(
    JSON.parse(await fs.readFile(options.electionPath, 'utf-8'))
  )
  const interpreter = new Interpreter({ election, testMode: false })

  for (const templateImagePath of options.templateImagePaths) {
    const imageData = await loadImageData(templateImagePath)
    binarize(imageData)
    const detected = await detect(election, imageData)
    await interpreter.addTemplate(imageData, {
      ...detected.metadata,
      isTestMode: false,
    })
  }

  for (const ballotImagePath of options.ballotImagePaths) {
    const imageData = await loadImageData(ballotImagePath)
    binarize(imageData)
    const detected = await detect(election, imageData)
    const template = interpreter['getTemplate'](detected.metadata)

    if (!template) {
      throw new Error(
        `no template found matching ${ballotImagePath} metadata: ${inspect(
          detected.metadata
        )}`
      )
    }

    if (detected.flipped) {
      vh(imageData)
    }

    const contests = findMatchingContests(
      imageData,
      template
      // makeDebugImageLogger()
    )
    const targetWidth = Math.max(15, Math.round(imageData.width * 0.01))

    for (const contest of contests) {
      fill(imageData, contest.bounds, GREEN_OVERLAY_COLOR)

      for (const corner of contest.corners) {
        drawTarget(imageData, corner, RED_OVERLAY_COLOR, targetWidth)
      }
    }

    const layoutFilePath = adjacentFile('-layout', ballotImagePath)
    stdout.write(
      `📝 ${layoutFilePath} ${chalk.gray(`(${contests.length} contest(s))`)}\n`
    )
    await writeImageToFile(imageData, layoutFilePath)
  }

  return 0
}

/**
 * Draws a target composed of concentric squares around a given point. If the
 * color has transparency, the fill blends with the existing image.
 */
export function drawTarget(
  { data, width, height }: ImageData,
  { x, y }: Point,
  color: RGBA,
  size: number
): void {
  assert.equal(getImageChannelCount({ data, width, height }), RGBA_CHANNELS)

  const halfSize = Math.ceil(size / 2)

  for (let xd = -halfSize; xd <= halfSize; xd++) {
    for (let yd = -halfSize; yd <= halfSize; yd++) {
      if (
        (xd % 2 !== 0 && Math.abs(yd) <= Math.abs(xd)) ||
        (yd % 2 !== 0 && Math.abs(xd) <= Math.abs(yd))
      ) {
        const offset = ((y + yd) * width + (x + xd)) * RGBA_CHANNELS
        const dst = data.slice(offset, offset + RGBA_CHANNELS)
        data.set(alphaBlend(dst, color), offset)
      }
    }
  }
}

/**
 * Fills a region of an image with a particular color. If the color has
 * transparency, the fill blends with the existing image.
 */
export function fill(
  { data, width, height }: ImageData,
  bounds: Rect,
  color: RGBA
): void {
  assert.equal(getImageChannelCount({ data, width, height }), RGBA_CHANNELS)

  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      const offset = (y * width + x) * RGBA_CHANNELS
      const dst = data.slice(offset, offset + RGBA_CHANNELS)
      data.set(alphaBlend(dst, color), offset)
    }
  }
}

export function line(
  imageData: ImageData,
  from: Point,
  to: Point,
  color: RGBA
): void {
  const { width, height } = imageData
  for (const point of lineSegmentPixels(from, to)) {
    if (point.x >= 0 && point.y >= 0 && point.x < width && point.y < height) {
      fill(imageData, { ...point, width: 1, height: 1 }, color)
    }
  }
}

/**
 * Computes the color of a pixel by blending `src` on top of `dst`.
 *
 * @see https://en.wikipedia.org/wiki/Alpha_compositing#Alpha_blending
 */
function alphaBlend(dst: ArrayLike<number>, src: ArrayLike<number>): RGBA {
  const dstR = dst[0]
  const dstG = dst[1]
  const dstB = dst[2]
  const dstA = dst[3]
  const srcR = src[0]
  const srcG = src[1]
  const srcB = src[2]
  const srcA = src[3]
  return [
    (srcR * srcA) / 0xff + ((dstR * dstA) / 0xff) * (1 - srcA / 0xff),
    (srcG * srcA) / 0xff + ((dstG * dstA) / 0xff) * (1 - srcA / 0xff),
    (srcB * srcA) / 0xff + ((dstB * dstA) / 0xff) * (1 - srcA / 0xff),
    (srcA / 0xff + (1 - srcA / 0xff)) * 0xff,
  ]
}
