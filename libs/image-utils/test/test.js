// @ts-check

const { createWriteStream } = require('fs')
const { getChannelCount, resize, grayscale } = require('..')
const { createCanvas, createImageData, loadImage } = require('canvas')
const { join } = require('path')

/**
 * @param {ImageData} imageData
 * @param {string} path
 */
async function writeImage(imageData, path) {
  const canvas = createCanvas(imageData.width, imageData.height)
  const context = canvas.getContext('2d')
  context.putImageData(toRGBA(imageData), 0, 0)
  await new Promise((resolve) => {
    canvas.createPNGStream().pipe(createWriteStream(path)).on('close', resolve)
  })
}

/**
 * @param {ImageData} imageData
 * @returns {ImageData}
 */
function toRGBA(imageData) {
  const channels = getChannelCount(imageData)

  if (channels === 4) {
    return imageData
  }

  const rgba = createImageData(imageData.width, imageData.height)
  let lumOffset = imageData.data.length
  let rgbaOffset = rgba.data.length

  do {
    lumOffset -= 1
    rgbaOffset -= 4

    const px = imageData.data[lumOffset]
    rgba.data[rgbaOffset] = px
    rgba.data[rgbaOffset + 1] = px
    rgba.data[rgbaOffset + 2] = px
    rgba.data[rgbaOffset + 3] = 0xff
  } while (lumOffset !== 0)

  return rgba
}

let fixtureImagePath = join(__dirname, 'votingworks-stacked.png')

/** @type {Readonly<ImageData>} */
let fixtureImageData

beforeAll(async () => {
  const img = await loadImage(fixtureImagePath)
  const canvas = createCanvas(img.width, img.height)
  const context = canvas.getContext('2d')
  context.drawImage(img, 0, 0)
  fixtureImageData = context.getImageData(0, 0, img.width, img.height)
})

test('resize rgba', async () => {
  const halfsize = createImageData(
    fixtureImageData.width / 2,
    fixtureImageData.height / 2
  )
  resize(fixtureImageData, halfsize)
  await writeImage(
    halfsize,
    fixtureImagePath.replace(/\.png$/, '-halfsize.png')
  )
})

test('grayscale rgba → lum', async () => {
  const lum = createImageData(
    new Uint8ClampedArray(fixtureImageData.width * fixtureImageData.height),
    fixtureImageData.width,
    fixtureImageData.height
  )
  grayscale(fixtureImageData, lum)
  await writeImage(lum, fixtureImagePath.replace(/\.png$/, '-grayscale.png'))
})

test('resize lum', async () => {
  const lum = createImageData(
    new Uint8ClampedArray(fixtureImageData.width * fixtureImageData.height),
    fixtureImageData.width,
    fixtureImageData.height
  )
  grayscale(fixtureImageData, lum)
  const halfsize = createImageData(
    new Uint8ClampedArray(
      (fixtureImageData.width * fixtureImageData.height) / 4
    ),
    fixtureImageData.width / 2,
    fixtureImageData.height / 2
  )
  resize(lum, halfsize)
  await writeImage(
    halfsize,
    fixtureImagePath.replace(/\.png$/, '-grayscale-halfsize.png')
  )
})
