import * as fixtures from '../../test/fixtures/choctaw-county-2020-general-election'
import { binarize } from '../utils/binarize'
import { findShape } from './shapes'

test('target size', async () => {
  const imageData = await fixtures.district5BlankPage1.imageData()
  binarize(imageData)
  expect(findShape(imageData, { x: 451, y: 1325 })).toMatchInlineSnapshot(`
    Object {
      "bounds": Object {
        "height": 22,
        "width": 32,
        "x": 451,
        "y": 1315,
      },
    }
  `)
})
