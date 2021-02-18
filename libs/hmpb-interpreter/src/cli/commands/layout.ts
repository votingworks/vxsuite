import lsd from '@votingworks/lsd'
import { Election, parseElection } from '@votingworks/types'
import { strict as assert } from 'assert'
import chalk from 'chalk'
import { promises as fs } from 'fs'
import { GlobalOptions, OptionParseError } from '..'
import { metadataFromBytes } from '../..'
import { writeImageToFile } from '../../../test/utils'
import findContests, { ContestShape } from '../../hmpb/findContests'
import { Point, Rect } from '../../types'
import { binarize, RGBA } from '../../utils/binarize'
import {
  closeBoxSegmentGaps,
  drawBoxes,
  filterContainedBoxes,
  filterInBounds,
  findBoxes,
  gridSegment,
  inferBoxFromPartial,
  isCompleteBox,
  Layout,
  matchTemplateLayout,
  mergeAdjacentLineSegments,
  scaleBox,
  splitIntoColumns,
} from '../../utils/box'
import { createImageData } from '../../utils/canvas'
import { vh } from '../../utils/flip'
import { euclideanDistance, rectInset } from '../../utils/geometry'
import { getImageChannelCount } from '../../utils/imageFormatUtils'
import { canvas, loadImageData } from '../../utils/images'
import { adjacentFile } from '../../utils/path'
import detect from '../../utils/qrcode'
import { setFilter, setMap } from '../../utils/set'

export interface Options {
  lsd?: boolean
  election: Election
  templateImagePaths: readonly string[]
  ballotImagePaths: readonly string[]
}

const RGBA_CHANNELS = 4
const RED_OVERLAY_COLOR: RGBA = [0xff, 0, 0, 0x60]
const GREEN_OVERLAY_COLOR: RGBA = [0, 0xff, 0, 0x60]

export const name = 'layout'
export const description = 'Annotate the interpreted layout of a ballot page'

export function printHelp($0: string, out: NodeJS.WritableStream): void {
  out.write(`${$0} layout IMG1 [IMG2 …]\n`)
  out.write(`\n`)
  out.write(chalk.italic(`Examples\n`))
  out.write(`\n`)
  out.write(chalk.gray(`# Annotate layout for a single ballot page.\n`))
  out.write(`${$0} layout ballot01.png\n`)
  out.write(`\n`)
  out.write(chalk.gray(`# Annotate layout for many ballot pages.\n`))
  out.write(`${$0} layout ballot*.png\n`)
}

export async function parseOptions({
  commandArgs: args,
}: GlobalOptions): Promise<Options> {
  let lsd: boolean | undefined
  let election: Election | undefined
  const templateImagePaths: string[] = []
  const ballotImagePaths: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--lsd') {
      lsd = true
    } else if (arg === '-t' || arg === '--template') {
      const value = args[++i]
      if (!value || value.startsWith('-')) {
        throw new Error(
          `expected value after ${arg}, but got ${value || 'nothing'}`
        )
      }
      templateImagePaths.push(value)
    } else if (arg === '-e' || arg === '--election') {
      const value = args[++i]
      if (!value || value.startsWith('-')) {
        throw new Error(
          `expected value after ${arg}, but got ${value || 'nothing'}`
        )
      }
      election = parseElection(JSON.parse(await fs.readFile(value, 'utf-8')))
    } else if (arg.startsWith('-')) {
      throw new OptionParseError(`unexpected option passed to 'layout': ${arg}`)
    } else {
      ballotImagePaths.push(arg)
    }
  }

  if (!election) {
    throw new Error('missing required option: --election')
  }

  return { lsd, election, templateImagePaths, ballotImagePaths }
}

interface AnalyzeImageResult {
  contests: ContestShape[]
  rotated: boolean
}

function analyzeImage(imageData: ImageData): AnalyzeImageResult {
  const binarized = createImageData(imageData.width, imageData.height)
  binarize(imageData, binarized)

  const transforms = [
    (imageData: ImageData): { imageData: ImageData; rotated: boolean } => ({
      imageData,
      rotated: false,
    }),
    (imageData: ImageData): { imageData: ImageData; rotated: boolean } => {
      const rotatedImageData = createImageData(
        new Uint8ClampedArray(imageData.data.length),
        imageData.width,
        imageData.height
      )
      vh(imageData, rotatedImageData)
      return { imageData: rotatedImageData, rotated: true }
    },
  ]

  const columnPatterns = [
    [true, true, true],
    [true, true],
  ]

  for (const transform of transforms) {
    const transformed = transform(binarized)

    for (const columns of columnPatterns) {
      const contests = [...findContests(transformed.imageData, { columns })]
      if (contests.length > 0) {
        return { contests, rotated: transformed.rotated }
      }
    }
  }

  return { contests: [], rotated: false }
}

function analyzeImageLSD(imageData: ImageData): ReturnType<typeof findBoxes> {
  const src32 = new Int32Array(imageData.data.buffer)
  const dst = new Uint8ClampedArray(imageData.width * imageData.height)

  for (let offset = 0, size = src32.length; offset < size; offset++) {
    const px = src32[offset]
    const r = px & 0xff
    const g = (px >>> 8) & 0xff
    const b = (px >>> 16) & 0xff

    // Luminosity grayscale formula.
    const luminosity = (0.21 * r + 0.72 * g + 0.07 * b) | 0
    dst[offset] = luminosity
  }

  const minLength = imageData.width * 0.1
  const segments = lsd({
    data: dst,
    width: imageData.width,
    height: imageData.height,
  })
    .filter(
      ({ x1, y1, x2, y2 }) =>
        euclideanDistance({ x: x1, y: y1 }, { x: x2, y: y2 }) >= minLength
    )
    .map(({ x1, y1, x2, y2 }) =>
      gridSegment({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 } })
    )
  const parallelThreshold = imageData.width * 2
  const maxConnectedCornerDistance = 0.01 * imageData.width
  const maxConnectedSegmentGap = 0.01 * imageData.width
  const result = findBoxes(
    mergeAdjacentLineSegments(segments, {
      parallelThreshold,
      maxConnectedSegmentGap,
    }),
    {
      maxConnectedCornerDistance,
      parallelThreshold,
    }
  )
  // const qc = canvas().background(imageData)
  // drawBoxes(qc, result.clockwise, { color: 'red' })
  // drawBoxes(qc, result.counterClockwise, { color: 'green' })
  // qc.render('debug-cw-ccw.png')
  return result
}

/**
 * Finds features in an image and writes an image adjacent with overlays marking
 * those features.
 */
export async function run(
  options: Options,
  _stdin: NodeJS.ReadableStream,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream
): Promise<number> {
  let totalCount = 0
  const errorPaths: string[] = []
  const layoutByQrcode = new Map<string, Layout>()

  for (const templateImagePath of options.templateImagePaths) {
    const imageData = await loadImageData(templateImagePath)
    const qrcode = await detect(imageData)

    if (!qrcode) {
      stderr.write(`✘ unable to read QR code in ${templateImagePath}\n`)
      return 1
    }

    if (!qrcode.rightSideUp) {
      vh(imageData)
    }

    const boxes = filterInBounds(
      setMap(
        filterContainedBoxes(
          setFilter(
            setMap(
              analyzeImageLSD(imageData).clockwise,
              (box) => inferBoxFromPartial(box) ?? box
            ),
            isCompleteBox
          )
        ),
        closeBoxSegmentGaps
      ),
      {
        bounds: rectInset(
          { x: 0, y: 0, width: imageData.width, height: imageData.height },
          imageData.width * 0.015
        ),
      }
    )

    stdout.write(`LSD found ${boxes.size} box(es) in ${templateImagePath}\n`)

    const metadata = metadataFromBytes(options.election, qrcode.data)
    metadata.electionHash = ''
    layoutByQrcode.set(JSON.stringify(metadata), {
      width: imageData.width,
      height: imageData.height,
      columns: splitIntoColumns(boxes),
    })
  }

  for (const ballotImagePath of options.ballotImagePaths) {
    totalCount++
    try {
      const imageData = await loadImageData(ballotImagePath)
      const { contests, rotated } = analyzeImage(imageData)
      const targetWidth = Math.max(15, Math.round(imageData.width * 0.01))

      if (rotated) {
        vh(imageData)
      }

      const layoutFilePath = adjacentFile('-layout', ballotImagePath)
      stdout.write(
        `📝 ${layoutFilePath} ${chalk.gray(
          `(${contests.length} contest(s))`
        )}\n`
      )

      if (options.lsd) {
        const qrcode = await detect(imageData)

        if (!qrcode) {
          stderr.write(
            `✘ unable to read QR code in ballot: ${ballotImagePath}\n`
          )
          continue
        }

        const metadata = metadataFromBytes(options.election, qrcode.data)
        metadata.electionHash = ''
        const templateLayout = layoutByQrcode.get(JSON.stringify(metadata))

        if (!templateLayout) {
          console.log(metadata, layoutByQrcode)
          stderr.write(`✘ no template found for ballot: ${ballotImagePath}\n`)
          continue
        }

        const width = 1060
        const height = 1750
        const scaled = canvas()
          .drawImage(imageData, 0, 0, width, height)
          .render()
        const analysis = analyzeImageLSD(scaled)
        const scaledBoxes = [
          ...analysis.clockwise,
          ...analysis.counterClockwise,
        ]
        // drawBoxes(
        //   canvas().drawImage(scaled, 0, 0, width, height),
        //   scaledBoxes
        // ).render('debug-01-scaledBoxes-NEW.png')
        const originalScaleBoxes = scaledBoxes.map((box) =>
          scaleBox(imageData.width / width, box)
        )
        // drawBoxes(canvas().background(imageData), originalScaleBoxes).render(
        //   'debug-02-originalScaledBoxes-NEW.png'
        // )
        const fullBoxes = originalScaleBoxes.map(
          (box) => inferBoxFromPartial(box) ?? box
        )
        // drawBoxes(canvas().background(imageData), fullBoxes).render(
        //   'debug-03-fullBoxes-NEW.png'
        // )
        const gaplessBoxes = fullBoxes.map((box) =>
          isCompleteBox(box) ? closeBoxSegmentGaps(box) : box
        )
        // drawBoxes(canvas().background(imageData), gaplessBoxes).render(
        //   'debug-04-gapless-NEW.png'
        // )
        const completeBoxes = gaplessBoxes.filter(isCompleteBox)
        // drawBoxes(canvas().background(imageData), completeBoxes).render(
        //   'debug-05-complete-NEW.png'
        // )
        const withoutContainedBoxes = filterContainedBoxes(completeBoxes)
        const withoutEdgeBoxes = filterInBounds(withoutContainedBoxes, {
          bounds: rectInset(
            { x: 0, y: 0, width: imageData.width, height: imageData.height },
            imageData.width * 0.015
          ),
        })
        // drawBoxes(canvas().background(imageData), withoutEdgeBoxes).render(
        //   'debug-06-withoutInset-NEW.png'
        // )
        const boxes = withoutEdgeBoxes
        const columns = splitIntoColumns(boxes)

        if (columns.length !== templateLayout.columns.length) {
          console.log(
            `COLUMN MISMATCH (scan has ${columns.length}, template has ${templateLayout.columns.length})`,
            ballotImagePath
          )
        }
        const fixedScanLayout = matchTemplateLayout(templateLayout, {
          width: imageData.width,
          height: imageData.height,
          columns,
        })
        const qc = canvas().background(imageData)
        if (!fixedScanLayout) {
          console.log('COLUMN MERGE MISMATCH', ballotImagePath)
          drawBoxes(qc, boxes)
        } else {
          for (const column of fixedScanLayout.columns) {
            const left = Math.min(
              ...column.flatMap(({ left }) => [left.start.x, left.end.x])
            )
            const top = Math.min(
              ...column.flatMap(({ top }) => [top.start.y, top.end.y])
            )
            const right = Math.max(
              ...column.flatMap(({ right }) => [right.start.x, right.end.x])
            )
            const bottom = Math.max(
              ...column.flatMap(({ bottom }) => [bottom.start.y, bottom.end.y])
            )
            qc.rect(left, top, right - left + 1, bottom - top + 1, {
              stroke: 10,
              color: 'green',
            })
            drawBoxes(qc, column)
          }
        }
        qc.render(layoutFilePath)
      } else {
        for (const contest of contests) {
          fill(imageData, contest.bounds, GREEN_OVERLAY_COLOR)

          for (const corner of contest.corners) {
            drawTarget(imageData, corner, RED_OVERLAY_COLOR, targetWidth)
          }
        }

        await writeImageToFile(imageData, layoutFilePath)
      }
    } catch (error) {
      stderr.write(chalk.red(`error: ${ballotImagePath}: ${error.stack}\n`))
      errorPaths.push(ballotImagePath)
    }
  }

  stdout.write(`${totalCount} processed, ${errorPaths.length} failed`)

  if (errorPaths.length === 0) {
    stdout.write('\n')
  } else {
    stdout.write(':\n')
    for (const path of errorPaths) {
      stdout.write(`${path}\n`)
    }
  }

  return errorPaths.length > 0 ? 1 : 0
}

/**
 * Draws a target composed of concentric squares around a given point. If the
 * color has transparency, the fill blends with the existing image.
 */
function drawTarget(
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
function fill(
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
