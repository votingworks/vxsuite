import {
  electionGridLayoutNewHampshireAmherstFixtures,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { fakeKiosk } from '@votingworks/test-utils';
import * as workflow from './export_election_ballot_package_workflow';
import { DownloadableArchive } from '../utils/downloadable_archive';

beforeEach(() => {
  window.kiosk = fakeKiosk();
});

test('initializes with an Election, hash, and locales', () => {
  expect(workflow.init(electionSampleDefinition, ['en-US']).type).toEqual(
    'Init'
  );
});

test('advances from Init to ArchiveBegin', () => {
  const state = workflow.init(electionSampleDefinition, ['en-US']);
  expect(workflow.next(state).type).toEqual('ArchiveBegin');
});

test('makes the first ballot config the current one moving from ArchiveBegin to RenderBallot', () => {
  expect(
    workflow.next({
      type: 'ArchiveBegin',
      electionDefinition: electionSampleDefinition,
      ballotConfigs: [
        {
          ballotStyleId: '77',
          precinctId: '42',
          contestIds: [],
          filename: 'live/ballot.pdf',
          layoutFilename: 'live/layout.json',
          isLiveMode: true,
          isAbsentee: false,
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
        layoutFilename: 'live/layout.json',
        isLiveMode: true,
        isAbsentee: false,
        locales: { primary: 'en-US' },
      },
    })
  );
});

test('advances to the next ballot config if there is one', () => {
  expect(
    workflow.next({
      type: 'RenderBallot',
      electionDefinition: electionSampleDefinition,
      archive: new DownloadableArchive(),
      currentBallotConfig: {
        ballotStyleId: '77',
        precinctId: '42',
        contestIds: [],
        filename: 'test/ballot.pdf',
        layoutFilename: 'test/layout.json',
        isLiveMode: false,
        isAbsentee: false,
        locales: { primary: 'en-US' },
      },
      remainingBallotConfigs: [
        {
          ballotStyleId: '77',
          precinctId: '42',
          contestIds: [],
          filename: 'live/ballot.pdf',
          layoutFilename: 'live/layout.json',
          isLiveMode: true,
          isAbsentee: false,
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
        layoutFilename: 'live/layout.json',
        isLiveMode: true,
        isAbsentee: false,
        locales: { primary: 'en-US' },
      },
      ballotConfigsCount: 2,
    })
  );
});

test('skips RenderBallot if there are no ballot configs', () => {
  expect(
    workflow.next({
      type: 'ArchiveBegin',
      electionDefinition:
        electionGridLayoutNewHampshireAmherstFixtures.electionDefinition,
      archive: new DownloadableArchive(),
      ballotConfigs: [],
    })
  ).toEqual(
    expect.objectContaining({
      type: 'ArchiveEnd',
      ballotConfigsCount: 0,
    })
  );
});

test('advances to ArchiveEnd if there are no more ballot configs', () => {
  expect(
    workflow.next({
      type: 'RenderBallot',
      electionDefinition: electionSampleDefinition,
      archive: new DownloadableArchive(),
      currentBallotConfig: {
        ballotStyleId: '77',
        precinctId: '42',
        contestIds: [],
        filename: 'test/ballot.pdf',
        layoutFilename: 'test/layout.json',
        isLiveMode: false,
        isAbsentee: false,
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
  );
});

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
  );
});

test('advances to Failed on render error', () => {
  expect(
    workflow.error(
      {
        type: 'RenderBallot',
        electionDefinition: electionSampleDefinition,
        archive: new DownloadableArchive(),
        currentBallotConfig: {
          ballotStyleId: '77',
          precinctId: '42',
          contestIds: [],
          filename: 'test/ballot.pdf',
          layoutFilename: 'test/layout.json',
          isLiveMode: false,
          isAbsentee: false,
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
  });
});
