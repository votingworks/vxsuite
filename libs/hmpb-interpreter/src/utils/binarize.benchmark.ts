import { Suite } from 'benchmark'
import { filledInPage1_01 } from '../../test/fixtures/choctaw-county-2020-general-election'
import { binarize } from './binarize'
import { binarize as binarizeFast } from './binarize.fast'
import { createImageData } from './canvas'

async function main() {
  const imageData = await filledInPage1_01.imageData()
  new Suite('binarize')
    .add('one byte at a time', () => {
      const dst = createImageData(imageData.width, imageData.height)
      binarize(imageData, dst)
    })
    .add('one pixel at a time', () => {
      const dst = createImageData(imageData.width, imageData.height)
      binarizeFast(imageData, dst)
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
