import { Application } from 'express'
import request from 'supertest'
import * as fs from 'fs'
import * as path from 'path'
import { electionSample as election } from '@votingworks/ballot-encoder'
import { buildApp } from './server'
import SystemImporter from './importer'
import Store from './store'
import { FujitsuScanner, Scanner } from './scanner'
import { CastVoteRecord, BatchInfo } from './types'

const sampleBallotImagesPath = path.join(
  __dirname,
  '..',
  'sample-ballot-images/'
)

// we need longer to make chokidar work
jest.setTimeout(10000)

jest.mock('./exec')

let app: Application
let importer: SystemImporter
let store: Store
let scanner: Scanner

beforeEach(async () => {
  store = await Store.memoryStore()
  scanner = new FujitsuScanner()
  importer = new SystemImporter({
    store,
    scanner,
  })
  app = buildApp({ importer, store })
})

function getScannerCVRCountWaiter(): {
  waitForCount(count: number): Promise<void>
} {
  let cvrCount = 0

  importer.addAddCVRCallback(() => {
    cvrCount += 1
  })

  return {
    waitForCount(count): Promise<void> {
      return new Promise((resolve) => {
        function checkCVRCount(): void {
          if (count <= cvrCount) {
            resolve()
          } else {
            setTimeout(checkCVRCount, 10)
          }
        }

        checkCVRCount()
      })
    },
  }
}

test('going through the whole process works', async () => {
  const waiter = getScannerCVRCountWaiter()

  {
    // try export before configure
    const response = await request(app)
      .post('/scan/export')
      .set('Accept', 'application/json')
      .expect(200)
    expect(response.text).toBe('')
  }

  await request(app)
    .post('/scan/configure')
    .send(election)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })

  await request(app).post('/scan/scanBatch').expect(200, { status: 'ok' })

  {
    // move some sample ballots into the ballots directory
    const expectedBallotCount = 3
    const sampleBallots = fs.readdirSync(sampleBallotImagesPath)
    for (const ballot of sampleBallots) {
      const oldPath = path.join(sampleBallotImagesPath, ballot)
      const newPath = path.join(importer.ballotImagesPath, ballot)
      fs.copyFileSync(oldPath, newPath)
    }

    // wait for the processing
    await waiter.waitForCount(expectedBallotCount)

    // check the status
    const status = await request(app)
      .get('/scan/status')
      .set('Accept', 'application/json')
      .expect(200)

    expect(JSON.parse(status.text).batches[0].count).toBe(expectedBallotCount)
  }

  // a manual ballot
  await request(app)
    .post('/scan/addManualBallot')
    .send({
      ballotString: '12.23.1|0|0|0||||||||||||||||.manual-test-serial-number',
    })
    .set('Accept', 'application/json')
    .expect(200)

  // a manual ballot - a second time shouldn't affect count
  await request(app)
    .post('/scan/addManualBallot')
    .send({
      ballotString: '12.23.1|0|0|0||||||||||||||||.manual-test-serial-number',
    })
    .set('Accept', 'application/json')
    .expect(200)

  {
    // check the latest batch has one ballot in it (the one we just made)
    const status = await request(app)
      .get('/scan/status')
      .set('Accept', 'application/json')
      .expect(200)
    expect(JSON.parse(status.text).batches[0].count).toBe(1)
    expect(JSON.parse(status.text).batches.length).toBe(2)
  }

  // a second distinct manual ballot
  await request(app)
    .post('/scan/addManualBallot')
    .send({
      ballotString: '12.23.1|1|0|0||||||||||||||||.manual-test-serial-number-2',
    })
    .set('Accept', 'application/json')
    .expect(200)

  {
    // check the latest batch has two manual ballots in it
    const status = await request(app)
      .get('/scan/status')
      .set('Accept', 'application/json')
      .expect(200)
    expect(JSON.parse(status.text).batches[0].count).toBe(2)
    expect(JSON.parse(status.text).batches.length).toBe(2)
  }

  {
    const exportResponse = await request(app)
      .post('/scan/export')
      .set('Accept', 'application/json')
      .expect(200)

    // response is a few lines, each JSON.
    // can't predict the order so can't compare
    // to expected outcome as a string directly.
    const CVRs: CastVoteRecord[] = exportResponse.text
      .split('\n')
      .map((line) => JSON.parse(line))
    const ballotIds = CVRs.map((cvr) => cvr._ballotId)
    ballotIds.sort()
    expect(JSON.stringify(ballotIds)).toBe(
      JSON.stringify([
        '85lnPkvfNEytP3Z8gMoEcA',
        'QZZeZdTBy8/RwGnoH6/mkw', // v1 encoding
        'manual-test-serial-number',
        'manual-test-serial-number-2',
        'r6UYR4t7hEFMz8QlMWf1Sw',
      ])
    )
  }

  let batchIdToDelete: number
  let cvrCountToDelete: number
  {
    // delete a batch
    const status = await request(app)
      .get('/scan/status')
      .set('Accept', 'application/json')
      .expect(200)
    ;[{ id: batchIdToDelete, count: cvrCountToDelete }] = JSON.parse(
      status.text
    ).batches
    await request(app)
      .delete(`/scan/batch/${batchIdToDelete}`)
      .set('Accept', 'application/json')
      .expect(200)
  }

  {
    // expect that we lost the first batch
    const status = await request(app)
      .get('/scan/status')
      .set('Accept', 'application/json')
      .expect(200)
    expect(
      JSON.parse(status.text).batches.every(
        (batch: BatchInfo) => batch.id !== batchIdToDelete
      )
    ).toBe(true)
  }

  // can't delete it again
  await request(app)
    .delete(`/scan/batch/${batchIdToDelete}`)
    .set('Accept', 'application/json')
    .expect(404)

  {
    const exportResponse = await request(app)
      .post('/scan/export')
      .set('Accept', 'application/json')
      .expect(200)

    // response is a few lines, each JSON.
    // can't predict the order so can't compare
    // to expected outcome as a string directly.
    const CVRs: CastVoteRecord[] = exportResponse.text
      .split('\n')
      .map((line) => JSON.parse(line))
    const ballotIds = CVRs.map((cvr) => cvr._ballotId)
    ballotIds.sort()
    expect(CVRs.length).toBe(5 - cvrCountToDelete)
  }

  // clean up
  await request(app).post('/scan/unconfigure')
})
