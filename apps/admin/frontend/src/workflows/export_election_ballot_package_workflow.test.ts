import { electionSampleDefinition } from '@votingworks/fixtures';
import { fakeKiosk } from '@votingworks/test-utils';
import { DownloadableArchive } from '../utils/downloadable_archive';
import * as workflow from './export_election_ballot_package_workflow';

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
      archive: new DownloadableArchive(),
    })
  ).toEqual(
    expect.objectContaining({
      type: 'ArchiveEnd',
    })
  );
});

test('advances from ArchiveEnd to Done', () => {
  expect(
    workflow.next({
      type: 'ArchiveEnd',
      archive: new DownloadableArchive(),
    })
  ).toEqual(
    expect.objectContaining({
      type: 'Done',
    })
  );
});
