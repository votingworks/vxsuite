import {
  electionFamousNames2021Fixtures,
  electionGeneralFixtures,
} from '@votingworks/fixtures';
import {
  BallotType,
  type Election,
  type ElectionDefinition,
  type EncodedBallotEntry,
  hashElectionData,
  LanguageCode,
  type PollingPlace,
} from '@votingworks/types';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** The famous-names election used by the screenshot tests. */
export function getFamousNamesElectionDefinition(): ElectionDefinition {
  return electionFamousNames2021Fixtures.readElectionDefinition();
}

// Languages to generate ballot-style variants for, matching electionGeneral's
// translations. English is first so it is the default ballot style.
const GENERAL_ELECTION_BALLOT_LANGUAGES: LanguageCode[] = [
  LanguageCode.ENGLISH,
  LanguageCode.SPANISH,
  LanguageCode.CHINESE_SIMPLIFIED,
  LanguageCode.CHINESE_TRADITIONAL,
];

/**
 * The general election, patched so each ballot style becomes a group of
 * per-language variants.
 */
export function getMultiLanguageGeneralElectionDefinition(): ElectionDefinition {
  const baseElectionDefinition =
    electionGeneralFixtures.readElectionDefinition();
  const ballotStyles = baseElectionDefinition.election.ballotStyles.flatMap(
    (ballotStyle) =>
      GENERAL_ELECTION_BALLOT_LANGUAGES.map((language) => ({
        ...ballotStyle,
        id: `${ballotStyle.groupId}_${language}`,
        languages: [language],
      }))
  );
  const election: Election = {
    ...baseElectionDefinition.election,
    ballotStyles,
  };

  const electionData = JSON.stringify(election);
  const ballotHash = hashElectionData(electionData);

  return { ballotHash, election, electionData };
}

/** The vote center polling place in {@link getVoteCenterGeneralElectionDefinition}. */
export const VOTE_CENTER_POLLING_PLACE_NAME = 'Springfield Vote Center';

/**
 * The multi-language general election with an added vote center polling place
 * covering every precinct that has a ballot style, so the poll worker ballot
 * style selector renders as a dropdown rather than a single precinct button.
 * The original polling places are kept so the election manager still chooses
 * one during configuration.
 */
export function getVoteCenterGeneralElectionDefinition(): ElectionDefinition {
  const baseElectionDefinition = getMultiLanguageGeneralElectionDefinition();
  const precinctIds = new Set(
    baseElectionDefinition.election.ballotStyles.flatMap((bs) => bs.precincts)
  );
  const voteCenter: PollingPlace = {
    id: 'springfield-vote-center',
    name: VOTE_CENTER_POLLING_PLACE_NAME,
    precincts: Object.fromEntries(
      [...precinctIds].map((precinctId) => [precinctId, { type: 'whole' }])
    ),
    type: 'election_day',
  };
  const election: Election = {
    ...baseElectionDefinition.election,
    pollingPlaces: [
      ...(baseElectionDefinition.election.pollingPlaces ?? []),
      voteCenter,
    ],
  };
  const electionData = JSON.stringify(election);
  const ballotHash = hashElectionData(electionData);
  return { ballotHash, election, electionData };
}

/**
 * Builds the pre-rendered ballots file for an election package using the
 * famous-names fixture PDFs round-robin, one entry per ballot style and
 * precinct. The ballot content doesn't match the election; the flows that
 * print pre-rendered ballots only need an entry to exist for each ballot style
 * and precinct.
 */
export async function buildPreRenderedBallots(
  electionDefinition: ElectionDefinition,
  ballotModes: ReadonlyArray<'official' | 'test'>
): Promise<EncodedBallotEntry[]> {
  const fixturesDir = resolve(
    process.cwd(),
    '../../../libs/hmpb/fixtures/vx-famous-names'
  );
  const pdfBase64s = await Promise.all(
    ['blank-ballot.pdf', 'blank-official-ballot.pdf'].map(async (name) =>
      (await readFile(join(fixturesDir, name))).toString('base64')
    )
  );
  const { ballotStyles } = electionDefinition.election;
  const ballots: EncodedBallotEntry[] = [];
  for (const [index, ballotStyle] of ballotStyles.entries()) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const encodedBallot = pdfBase64s[index % pdfBase64s.length]!;
    for (const precinctId of ballotStyle.precincts) {
      for (const ballotMode of ballotModes) {
        ballots.push({
          ballotStyleId: ballotStyle.id,
          precinctId,
          ballotType: BallotType.Precinct,
          ballotMode,
          encodedBallot,
        });
      }
    }
  }
  return ballots;
}
