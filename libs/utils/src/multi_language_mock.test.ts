import { expect, test } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { getMockMultiLanguageElectionDefinition } from './multi_language_mock';

test('getMockMultiLanguageElectionDefinition', () => {
  const electionDefinition = readElectionGeneralDefinition();
  expect(
    electionDefinition.election.ballotStyles.map((bs) => ({
      id: bs.id,
      languages: bs.languages,
    }))
  ).toEqual([{ id: '12' }, { id: '5' }]);

  const modifiedElectionDefinition = getMockMultiLanguageElectionDefinition(
    electionDefinition,
    ['en', 'es-US']
  );
  expect(
    modifiedElectionDefinition.election.ballotStyles.map((bs) => ({
      id: bs.id,
      languages: bs.languages,
    }))
  ).toEqual([
    { id: '1_en', languages: ['en'] },
    { id: '1_es-US', languages: ['es-US'] },
    { id: '2_en', languages: ['en'] },
    { id: '2_es-US', languages: ['es-US'] },
  ]);

  expect(modifiedElectionDefinition.ballotHash).not.toEqual(
    electionDefinition.ballotHash
  );
});
