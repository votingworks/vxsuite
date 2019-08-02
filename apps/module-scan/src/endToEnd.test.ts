import request from 'supertest'
import * as fs from 'fs'
import * as path from 'path'
import { app } from './server'
import election from '../election.json'
import { ballotImagesPath, doZero, sampleBallotImagesPath } from './scanner'

// we need longer to make chokidar work
jest.setTimeout(10000)

jest.mock('./exec', () => ({
  __esModule: true,
  default: jest.fn((_command, callback) => {
    callback()
  }),
}))

beforeAll(done => {
  doZero().then(() => done())
})

test('going through the whole process works', async done => {
  // try export before configure
  const response = await request(app)
    .post('/scan/export')
    .set('Accept', 'application/json')
    .expect(200)
  expect(response.text).toBe('')

  await request(app)
    .post('/scan/configure')
    .send(election)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })

  await request(app)
    .post('/scan/scanBatch')
    .expect(200, { status: 'ok' })

  // move some sample ballots into the ballots directory
  const sampleBallots = fs.readdirSync(sampleBallotImagesPath)
  for (const ballot of sampleBallots) {
    const oldPath = path.join(sampleBallotImagesPath, ballot)
    const newPath = path.join(ballotImagesPath, ballot)
    fs.copyFileSync(oldPath, newPath)
  }

  // wait for the processing (takes more than 4 seconds cause chokidar)
  await new Promise(resolve => setTimeout(resolve, 4000))

  // check the status
  let status = await request(app)
    .get('/scan/status')
    .set('Accept', 'application/json')
    .expect(200)

  expect(JSON.parse(status.text).batches[0].count).toBe(2)

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

  // check the latest batch has one ballot in it (the one we just made)
  status = await request(app)
    .get('/scan/status')
    .set('Accept', 'application/json')
    .expect(200)
  expect(JSON.parse(status.text).batches[0].count).toBe(1)
  expect(JSON.parse(status.text).batches.length).toBe(2)

  // a second distinct manual ballot
  await request(app)
    .post('/scan/addManualBallot')
    .send({
      ballotString: '12.23.1|1|0|0||||||||||||||||.manual-test-serial-number-2',
    })
    .set('Accept', 'application/json')
    .expect(200)

  // check the latest batch has two manual ballots in it
  status = await request(app)
    .get('/scan/status')
    .set('Accept', 'application/json')
    .expect(200)
  expect(JSON.parse(status.text).batches[0].count).toBe(2)
  expect(JSON.parse(status.text).batches.length).toBe(2)

  const exportResponse = await request(app)
    .post('/scan/export')
    .set('Accept', 'application/json')
    .expect(200)

  // response is a few lines, each JSON.
  // can't predict the order so can't compare
  // to expected outcome as a string directly.
  // @ts-ignore
  const CVRs = exportResponse.text.split('\n').map(JSON.parse)
  const serialNumbers = CVRs.map(
    (cvr: { _serialNumber: string }) => cvr._serialNumber
  )
  serialNumbers.sort()
  expect(JSON.stringify(serialNumbers)).toBe(
    JSON.stringify([
      '85lnPkvfNEytP3Z8gMoEcA',
      'manual-test-serial-number',
      'manual-test-serial-number-2',
      'r6UYR4t7hEFMz8QlMWf1Sw',
    ])
  )

  // clean up
  request(app)
    .post('/scan/unconfigure')
    .then(() => {
      done()
    })
})
