import { electionSample } from '@votingworks/ballot-encoder'
import { readFile } from 'fs-extra'
import { join } from 'path'
import stateOfHamiltonElection from '../test/fixtures/state-of-hamilton/election'
import choctaw2020Election from '../test/fixtures/2020-choctaw/election'
import SummaryBallotInterpreter, {
  getBallotImageData,
  InterpretedHmpbBallot,
  UninterpretedHmpbBallot,
} from './interpreter'
import pdfToImages from './util/pdfToImages'

const sampleBallotImagesPath = join(__dirname, '..', 'sample-ballot-images/')
const stateOfHamiltonFixturesRoot = join(
  __dirname,
  '..',
  'test/fixtures/state-of-hamilton'
)
const choctaw2020FixturesRoot = join(
  __dirname,
  '..',
  'test/fixtures/2020-choctaw'
)

test('reads QR codes from ballot images #1', async () => {
  const filepath = join(sampleBallotImagesPath, 'sample-batch-1-ballot-1.jpg')
  const { qrcode } = await getBallotImageData(
    await readFile(filepath),
    filepath
  )

  expect(qrcode).toEqual(
    Buffer.from('12.23.1|||||||||||||||||||.r6UYR4t7hEFMz8QlMWf1Sw')
  )
})

test('reads QR codes from ballot images #2', async () => {
  const filepath = join(sampleBallotImagesPath, 'sample-batch-1-ballot-2.jpg')
  const { qrcode } = await getBallotImageData(
    await readFile(filepath),
    filepath
  )

  expect(qrcode).toEqual(
    Buffer.from(
      '12.23.3|1|1|1|0|0|||0,2,W||1|2|1|0||||1||0.85lnPkvfNEytP3Z8gMoEcA'
    )
  )
})

test('does not find QR codes when there are none to find', async () => {
  const filepath = join(sampleBallotImagesPath, 'not-a-ballot.jpg')
  await expect(
    getBallotImageData(await readFile(filepath), filepath)
  ).rejects.toThrowError('no QR code found')
})

test('extracts a CVR from votes encoded in a QR code', async () => {
  const ballotImagePath = join(
    sampleBallotImagesPath,
    'sample-batch-1-ballot-1.jpg'
  )
  expect(
    ((await new SummaryBallotInterpreter().interpretFile({
      election: electionSample,
      ballotImagePath,
      ballotImageFile: await readFile(ballotImagePath),
    })) as InterpretedHmpbBallot).cvr
  ).toEqual(
    expect.objectContaining({
      _ballotId: 'r6UYR4t7hEFMz8QlMWf1Sw',
      _ballotStyleId: '12',
      _precinctId: '23',
      president: ['cramer-vuocolo'],
    })
  )
})

test('interprets marks on a HMPB', async () => {
  const interpreter = new SummaryBallotInterpreter()

  interpreter.setTestMode(false)

  for await (const { page, pageNumber } of pdfToImages(
    await readFile(join(stateOfHamiltonFixturesRoot, 'ballot.pdf')),
    { scale: 2 }
  )) {
    await interpreter.addHmpbTemplate(stateOfHamiltonElection, page)

    if (pageNumber === 1) {
      break
    }
  }

  const ballotImagePath = join(
    stateOfHamiltonFixturesRoot,
    'filled-in-dual-language-p1.jpg'
  )
  const cvr = ((await interpreter.interpretFile({
    election: stateOfHamiltonElection,
    ballotImagePath,
    ballotImageFile: await readFile(ballotImagePath),
  })) as InterpretedHmpbBallot).cvr

  delete cvr?._ballotId

  expect(cvr).toMatchInlineSnapshot(`
    Object {
      "_ballotStyleId": "12",
      "_locales": Object {
        "primary": "en-US",
        "secondary": "es-US",
      },
      "_pageNumber": 1,
      "_precinctId": "23",
      "_scannerId": "000",
      "_testBallot": false,
      "president": Array [
        "barchi-hallaren",
      ],
      "representative-district-6": Array [
        "schott",
      ],
      "senator": Array [
        "brown",
      ],
    }
  `)
})

test('interprets marks on an upside-down HMPB', async () => {
  const interpreter = new SummaryBallotInterpreter()

  interpreter.setTestMode(false)

  for await (const { page, pageNumber } of pdfToImages(
    await readFile(join(stateOfHamiltonFixturesRoot, 'ballot.pdf')),
    { scale: 2 }
  )) {
    await interpreter.addHmpbTemplate(stateOfHamiltonElection, page)

    if (pageNumber === 1) {
      break
    }
  }

  const ballotImagePath = join(
    stateOfHamiltonFixturesRoot,
    'filled-in-dual-language-p1-flipped.jpg'
  )
  const cvr = ((await interpreter.interpretFile({
    election: stateOfHamiltonElection,
    ballotImagePath,
    ballotImageFile: await readFile(ballotImagePath),
  })) as InterpretedHmpbBallot).cvr

  delete cvr?._ballotId

  expect(cvr).toMatchInlineSnapshot(`
    Object {
      "_ballotStyleId": "12",
      "_locales": Object {
        "primary": "en-US",
        "secondary": "es-US",
      },
      "_pageNumber": 1,
      "_precinctId": "23",
      "_scannerId": "000",
      "_testBallot": false,
      "president": Array [
        "barchi-hallaren",
      ],
      "representative-district-6": Array [
        "schott",
      ],
      "senator": Array [
        "brown",
      ],
    }
  `)
})

test('interprets marks in PNG ballots', async () => {
  jest.setTimeout(10000)

  const interpreter = new SummaryBallotInterpreter()

  interpreter.setTestMode(false)

  for await (const { page } of pdfToImages(
    await readFile(join(choctaw2020FixturesRoot, 'ballot.pdf')),
    { scale: 2 }
  )) {
    await interpreter.addHmpbTemplate(choctaw2020Election, page)
  }

  {
    const ballotImagePath = join(choctaw2020FixturesRoot, 'filled-in-p1.png')
    const cvr = ((await interpreter.interpretFile({
      election: choctaw2020Election,
      ballotImagePath,
      ballotImageFile: await readFile(ballotImagePath),
    })) as InterpretedHmpbBallot).cvr

    delete cvr?._ballotId

    expect(cvr).toMatchInlineSnapshot(`
      Object {
        "1": Array [
          "1",
        ],
        "2": Array [
          "23",
        ],
        "3": Array [
          "32",
        ],
        "4": Array [
          "__write-in",
        ],
        "_ballotStyleId": "1",
        "_locales": Object {
          "primary": "en-US",
        },
        "_pageNumber": 1,
        "_precinctId": "6526",
        "_scannerId": "000",
        "_testBallot": false,
        "initiative-65": Array [
          "yes",
          "no",
        ],
        "initiative-65-a": Array [
          "yes",
        ],
      }
    `)
  }

  {
    const ballotImagePath = join(choctaw2020FixturesRoot, 'filled-in-p2.png')
    const cvr = ((await interpreter.interpretFile({
      election: choctaw2020Election,
      ballotImagePath,
      ballotImageFile: await readFile(ballotImagePath),
    })) as InterpretedHmpbBallot).cvr

    delete cvr?._ballotId

    expect(cvr).toMatchInlineSnapshot(`
      Object {
        "_ballotStyleId": "1",
        "_locales": Object {
          "primary": "en-US",
        },
        "_pageNumber": 2,
        "_precinctId": "6526",
        "_scannerId": "000",
        "_testBallot": false,
        "flag-question": Array [
          "yes",
        ],
        "runoffs-question": Array [
          "no",
        ],
      }
    `)
  }
})

test('returns metadata if the QR code is readable but the HMPB ballot is not', async () => {
  const interpreter = new SummaryBallotInterpreter()

  interpreter.setTestMode(false)

  for await (const { page, pageNumber } of pdfToImages(
    await readFile(join(stateOfHamiltonFixturesRoot, 'ballot.pdf')),
    { scale: 2 }
  )) {
    await interpreter.addHmpbTemplate(stateOfHamiltonElection, page)

    if (pageNumber === 3) {
      break
    }
  }

  const ballotImagePath = join(
    stateOfHamiltonFixturesRoot,
    'filled-in-dual-language-p3.jpg'
  )
  expect(
    (await interpreter.interpretFile({
      election: stateOfHamiltonElection,
      ballotImagePath,
      ballotImageFile: await readFile(ballotImagePath),
    })) as UninterpretedHmpbBallot
  ).toMatchInlineSnapshot(`
    Object {
      "metadata": Object {
        "ballotStyleId": "12",
        "isTestBallot": false,
        "locales": Object {
          "primary": "en-US",
          "secondary": "es-US",
        },
        "pageCount": 5,
        "pageNumber": 3,
        "precinctId": "23",
      },
      "type": "UninterpretedHmpbBallot",
    }
  `)
})
