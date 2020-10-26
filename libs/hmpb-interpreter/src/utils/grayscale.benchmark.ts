import { Event, Suite } from 'benchmark'
import { filledInPage1_01 } from '../../test/fixtures/choctaw-county-2020-general-election'
import { createImageData } from './canvas'
import grayscale from './grayscale'
import grayscaleFast from './grayscale.fast'
import jsfeat from 'jsfeat'

async function main() {
  const imageData = await filledInPage1_01.imageData()

  new Suite('RGBA to grayscale')
    .add('one byte at a time', () => {
      const dst = createImageData(imageData.width, imageData.height)
      grayscale(imageData, dst)
    })
    .add('one pixel at a time', () => {
      const dst = createImageData(imageData.width, imageData.height)
      grayscaleFast(imageData, dst)
    })
    .add('jsfeat', () => {
      const dst = new jsfeat.matrix_t(
        imageData.width,
        imageData.height,
        jsfeat.F32_t | jsfeat.C1_t
      )
      jsfeat.imgproc.grayscale(
        new Float32Array(imageData.data.buffer),
        imageData.width,
        imageData.height,
        dst
      )
    })
    // add listeners
    .on('start', function (this: any) {
      console.log(this.name)
    })
    .on('cycle', function (event: Event) {
      console.log(String(event.target))
    })
    .on('complete', function (this: Suite) {
      console.log('Fastest is ' + this.filter('fastest').map('name' as any))
    })
    // run async
    .run({ async: true })
}

main()
