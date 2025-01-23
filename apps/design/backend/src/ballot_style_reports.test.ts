import { expect, test, vi } from 'vitest';
import { readElectionGeneral } from '@votingworks/fixtures';
import { createPlaywrightRenderer } from '@votingworks/hmpb';
import {
  Election,
  safeParseElectionDefinition,
  LanguageCode,
} from '@votingworks/types';
import { generateBallotStyleId } from '@votingworks/utils';
import { renderBallotStyleReadinessReport } from './ballot_style_reports';

vi.setConfig({
  testTimeout: 10_000,
});

const electionGeneral = readElectionGeneral();
const { ENGLISH, CHINESE_SIMPLIFIED, SPANISH } = LanguageCode;
const ballotLanguages = [ENGLISH, CHINESE_SIMPLIFIED, SPANISH];
const parties = electionGeneral.parties.slice(0, 2);

const ballotStyles = electionGeneral.ballotStyles.flatMap((ballotStyle, i) =>
  parties.flatMap((party) =>
    ballotLanguages.map((languageCode) => ({
      ...ballotStyle,
      id: generateBallotStyleId({
        ballotStyleIndex: i + 1,
        languages: [languageCode],
        party,
      }),
      languages: [languageCode],
      partyId: party.id,
    }))
  )
);

const election: Election = {
  ...electionGeneral,
  ballotStyles,
  title: 'Mock Primary Election',
};

const electionDefinition = safeParseElectionDefinition(
  JSON.stringify(election)
).unsafeUnwrap();

test('PDF layout regression test', async () => {
  const renderer = await createPlaywrightRenderer();

  const reportPdf = await renderBallotStyleReadinessReport({
    componentProps: {
      electionDefinition,
      generatedAtTime: new Date('2021-07-25, 08:00'),
    },
    renderer,
  });

  await expect(reportPdf).toMatchPdfSnapshot();

  await renderer.cleanup();
}, 10_000);
