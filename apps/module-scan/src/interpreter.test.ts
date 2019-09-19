import { join } from 'path'
import { readQRCodesFromImageFile } from './interpreter'

const sampleBallotImagesPath = join(__dirname, '..', 'sample-ballot-images/')

test('reads QR codes from ballot images #1', async () => {
  const qrCodes = await readQRCodesFromImageFile(
    join(sampleBallotImagesPath, 'sample-batch-1-ballot-1.jpg')
  )

  expect(qrCodes).toEqual([
    Buffer.from('12.23.1|||||||||||||||||||.r6UYR4t7hEFMz8QlMWf1Sw'),
  ])
})

test('reads QR codes from ballot images #2', async () => {
  const qrCodes = await readQRCodesFromImageFile(
    join(sampleBallotImagesPath, 'sample-batch-1-ballot-2.jpg')
  )

  expect(qrCodes).toEqual([
    Buffer.from(
      '12.23.3|1|1|1|0|0|||0,2,W||1|2|1|0||||1||0.85lnPkvfNEytP3Z8gMoEcA'
    ),
  ])
})

test('does not find QR codes when there are none to find', async () => {
  const qrCodes = await readQRCodesFromImageFile(
    join(sampleBallotImagesPath, 'not-a-ballot.jpg')
  )

  expect(qrCodes).toEqual([])
})
