import { electionSampleDefinition } from '@votingworks/fixtures';
import { fakeKiosk } from '@votingworks/test-utils';
import { typedAs } from '@votingworks/basics';
import * as workflow from './export_election_ballot_package_workflow';
import { DownloadableArchive } from '../utils/downloadable_archive';

beforeEach(() => {
  window.kiosk = fakeKiosk();
});

test('initializes with an Election, hash, and locales', () => {
  expect(workflow.init(electionSampleDefinition).type).toEqual('Init');
});

test('advances from Init to ArchiveBegin', () => {
  const state = workflow.init(electionSampleDefinition);
  expect(workflow.next(state).type).toEqual('ArchiveBegin');
});

test('advances from ArchiveBegin to ArchiveEnd', () => {
  expect(
    workflow.next({
      type: 'ArchiveBegin',
      electionDefinition: electionSampleDefinition,
      ballotConfigs: [],
      archive: new DownloadableArchive(),
    })
  ).toEqual(
    expect.objectContaining(
      typedAs<workflow.ArchiveEnd>({
        type: 'ArchiveEnd',
        ballotConfigsCount: 0,
        archive: expect.any(DownloadableArchive),
      })
    )
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
