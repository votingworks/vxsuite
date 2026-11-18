import { expect, test, vi } from 'vitest';
import { DateWithoutTime } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import { DEFAULT_SYSTEM_SETTINGS, LanguageCode } from '@votingworks/types';
import { Store } from '../store.js';
import { failInterruptedElectionPackageBuilds } from './election_package.js';

test('failInterruptedElectionPackageBuilds fails and logs builds left running', () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const logger = mockBaseLogger({ fn: vi.fn });

  failInterruptedElectionPackageBuilds({ store, logger });
  expect(logger.log).not.toHaveBeenCalled();

  store.electionDefinition.createInProgressElection(
    {
      electionId: 'design-election',
      type: 'general',
      date: new DateWithoutTime('2026-11-03'),
      title: '',
      state: 'DEMO',
      jurisdictionName: '',
      seal: '',
      languageCodes: [LanguageCode.ENGLISH],
    },
    DEFAULT_SYSTEM_SETTINGS
  );
  store.electionDefinition.finalizeElection('design-election');

  failInterruptedElectionPackageBuilds({ store, logger });
  expect(
    store.electionDefinition.getElectionPackage('design-election')
  ).toEqual({
    status: 'failed',
    error: 'VxAdmin restarted before the election package was built.',
  });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ElectionDefinitionElectionPackageBuilt,
    'system',
    {
      message:
        'Error building the election package for election definition design-election: VxAdmin restarted before the election package was built.',
      disposition: 'failure',
    }
  );
});
