import * as workflow from './ExportElectionBallotPackageWorkflow'
import { electionSample } from '@votingworks/ballot-encoder'
import DownloadableArchive from '../utils/DownloadableArchive'

test('initializes with an Election, hash, and locales', () => {
  expect(workflow.init(electionSample, 'abcde', ['en-US']).type).toEqual('Init')
})

test('advances from Init to ArchiveBegin', () => {
  const state = workflow.init(electionSample, 'abcde', ['en-US'])
  expect(workflow.next(state).type).toEqual('ArchiveBegin')
})

test('makes the first ballot config the current one moving from ArchiveBegin to RenderBallot', () => {
  expect(
    workflow.next({
      type: 'ArchiveBegin',
      election: electionSample,
      electionHash: 'abcde',
      ballotConfigs: [
        {
          ballotStyleId: '77',
          precinctId: '42',
          contestIds: [],
          filename: 'live/ballot.pdf',
          isLiveMode: true,
          locales: { primary: 'en-US' },
        },
      ],
      archive: new DownloadableArchive(),
    })
  ).toEqual(
    expect.objectContaining({
      type: 'RenderBallot',
      remainingBallotConfigs: [],
      currentBallotConfig: {
        ballotStyleId: '77',
        precinctId: '42',
        contestIds: [],
        filename: 'live/ballot.pdf',
        isLiveMode: true,
        locales: { primary: 'en-US' },
      },
    })
  )
})

test('advances to the next ballot config if there is one', () => {
  expect(
    workflow.next({
      type: 'RenderBallot',
      election: electionSample,
      electionHash: 'abcde',
      archive: new DownloadableArchive(),
      currentBallotConfig: {
        ballotStyleId: '77',
        precinctId: '42',
        contestIds: [],
        filename: 'test/ballot.pdf',
        isLiveMode: false,
        locales: { primary: 'en-US' },
      },
      remainingBallotConfigs: [
        {
          ballotStyleId: '77',
          precinctId: '42',
          contestIds: [],
          filename: 'live/ballot.pdf',
          isLiveMode: true,
          locales: { primary: 'en-US' },
        },
      ],
      ballotConfigsCount: 2,
    })
  ).toEqual(
    expect.objectContaining({
      type: 'RenderBallot',
      remainingBallotConfigs: [],
      currentBallotConfig: {
        ballotStyleId: '77',
        precinctId: '42',
        contestIds: [],
        filename: 'live/ballot.pdf',
        isLiveMode: true,
        locales: { primary: 'en-US' },
      },
      ballotConfigsCount: 2,
    })
  )
})

test('advances to ArchiveEnd if there are no more ballot configs', () => {
  expect(
    workflow.next({
      type: 'RenderBallot',
      election: electionSample,
      electionHash: 'abcde',
      archive: new DownloadableArchive(),
      currentBallotConfig: {
        ballotStyleId: '77',
        precinctId: '42',
        contestIds: [],
        filename: 'test/ballot.pdf',
        isLiveMode: false,
        locales: { primary: 'en-US' },
      },
      remainingBallotConfigs: [],
      ballotConfigsCount: 2,
    })
  ).toEqual(
    expect.objectContaining({
      type: 'ArchiveEnd',
      ballotConfigsCount: 2,
    })
  )
})

test('advances from ArchiveEnd to Done', () => {
  expect(
    workflow.next({
      type: 'ArchiveEnd',
      archive: new DownloadableArchive(),
      ballotConfigsCount: 2,
    })
  ).toEqual(
    expect.objectContaining({
      type: 'Done',
      ballotConfigsCount: 2,
    })
  )
})

test('advances to Failed on render error', () => {
  expect(
    workflow.error(
      {
        type: 'RenderBallot',
        election: electionSample,
        electionHash: 'abcde',
        archive: new DownloadableArchive(),
        currentBallotConfig: {
          ballotStyleId: '77',
          precinctId: '42',
          contestIds: [],
          filename: 'test/ballot.pdf',
          isLiveMode: false,
          locales: { primary: 'en-US' },
        },
        remainingBallotConfigs: [],
        ballotConfigsCount: 3,
      },
      new Error('something happened!')
    )
  ).toEqual({
    type: 'Failed',
    message: 'something happened!',
  })
})
