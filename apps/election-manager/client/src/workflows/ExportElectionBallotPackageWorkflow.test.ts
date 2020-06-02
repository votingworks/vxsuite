import { init, next, error } from './ExportElectionBallotPackageWorkflow'
import { electionSample } from '@votingworks/ballot-encoder'
import DownloadableArchive from '../utils/DownloadableArchive'

test('initializes with an Election', () => {
  expect(init(electionSample).type).toEqual('Init')
})

test('advances from Init to ArchiveBegin', () => {
  const state = init(electionSample)
  expect(next(state).type).toEqual('ArchiveBegin')
})

test('advances from ArchiveBegin to RenderBallot with the first ballot in live mode', () => {
  expect(
    next({
      type: 'ArchiveBegin',
      election: electionSample,
      archive: new DownloadableArchive(),
    })
  ).toEqual(
    expect.objectContaining({
      type: 'RenderBallot',
      ballotIndex: 0,
      testMode: false,
    })
  )
})

test('advances from RenderBallot by rendering a test ballot after a live one', () => {
  expect(
    next({
      type: 'RenderBallot',
      archive: new DownloadableArchive(),
      ballotData: [
        { ballotStyleId: '77', precinctId: '42', contestIds: ['1'] },
      ],
      ballotIndex: 0,
      testMode: false,
    })
  ).toEqual({
    type: 'RenderBallot',
    archive: new DownloadableArchive(),
    ballotData: [{ ballotStyleId: '77', precinctId: '42', contestIds: ['1'] }],
    ballotIndex: 0,
    testMode: true,
  })
})

test('advances from RenderBallot by rendering the next page after both live and test are rendered', () => {
  expect(
    next({
      type: 'RenderBallot',
      archive: new DownloadableArchive(),
      ballotData: [
        { ballotStyleId: '77', precinctId: '42', contestIds: ['1'] },
        { ballotStyleId: '77', precinctId: '42', contestIds: ['2'] },
      ],
      ballotIndex: 0,
      testMode: true,
    })
  ).toEqual(
    expect.objectContaining({
      type: 'RenderBallot',
      ballotIndex: 1,
      testMode: false,
    })
  )
})

test('advances from RenderBallot to ArchiveEnd after the last page', () => {
  expect(
    next({
      type: 'RenderBallot',
      archive: new DownloadableArchive(),
      ballotData: [
        { ballotStyleId: '77', precinctId: '42', contestIds: ['1'] },
        { ballotStyleId: '77', precinctId: '42', contestIds: ['2'] },
      ],
      ballotIndex: 1,
      testMode: true,
    })
  ).toEqual(
    expect.objectContaining({
      type: 'ArchiveEnd',
      ballotCount: 2,
    })
  )
})

test('advances from ArchiveEnd to Done', () => {
  expect(
    next({
      type: 'ArchiveEnd',
      archive: new DownloadableArchive(),
      ballotCount: 2,
    })
  ).toEqual({
    type: 'Done',
    ballotCount: 2,
  })
})

test('advances to Failed on render error', () => {
  expect(
    error(
      {
        type: 'RenderBallot',
        archive: new DownloadableArchive(),
        ballotData: [
          { ballotStyleId: '77', precinctId: '42', contestIds: ['1'] },
          { ballotStyleId: '77', precinctId: '42', contestIds: ['2'] },
        ],
        ballotIndex: 1,
        testMode: true,
      },
      new Error('something happened!')
    )
  ).toEqual({
    type: 'Failed',
    message: 'something happened!',
  })
})
