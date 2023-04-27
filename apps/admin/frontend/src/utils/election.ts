import { Admin } from '@votingworks/api';
import {
  AnyContest,
  BallotLocale,
  Election,
  getContests,
  getPrecinctById,
  Party,
  PartyId,
  BallotStyleId,
  PrecinctId,
  ElectionDefinition,
  getDisplayElectionHash,
} from '@votingworks/types';
import { assert, find } from '@votingworks/basics';
import { BallotStyleData } from '@votingworks/utils';
import dashify from 'dashify';
import { LANGUAGES } from '../config/globals';

import { sortBy } from './sort_by';

export function getDistrictIdsForPartyId(
  election: Election,
  partyId: PartyId
): string[] {
  return election.ballotStyles
    .filter((bs) => bs.partyId === partyId)
    .flatMap((bs) => bs.districts);
}

export function getPartiesWithPrimaryElections(election: Election): Party[] {
  const partyIds = election.ballotStyles
    .map((bs) => bs.partyId)
    .filter((id): id is PartyId => id !== undefined);
  return election.parties.filter((party) => partyIds.includes(party.id));
}

const sortOptions: Intl.CollatorOptions = {
  ignorePunctuation: true,
  numeric: true,
};

export function getBallotStylesData(election: Election): BallotStyleData[] {
  return election.ballotStyles.flatMap((ballotStyle) =>
    ballotStyle.precincts.map<BallotStyleData>((precinctId) => ({
      ballotStyleId: ballotStyle.id,
      precinctId,
      contestIds: getContests({ ballotStyle, election }).map((c) => c.id),
    }))
  );
}

const superBallotStyleId = 'vx-super-ballot';
const superBallotStylePrecinctId = 'vx-all-precincts';

/**
 * Generates the data necessary to render a super ballot, a special ballot only available to system
 * admins that includes all contests across all precincts
 */
export function getSuperBallotStyleData(election: Election): BallotStyleData {
  return {
    ballotStyleId: superBallotStyleId,
    contestIds: election.contests.map((c) => c.id),
    precinctId: superBallotStylePrecinctId,
  };
}

/**
 * Returns whether a ballot style ID corresponds to the super ballot, a special ballot only
 * available to system admins that includes all contests across all precincts
 */
export function isSuperBallotStyle(ballotStyleId: BallotStyleId): boolean {
  return ballotStyleId === superBallotStyleId;
}

function ballotStyleComparator(a: BallotStyleData, b: BallotStyleData) {
  return a.ballotStyleId.localeCompare(b.ballotStyleId, undefined, sortOptions);
}

function makePrecinctComparator(election: Election) {
  return (a: BallotStyleData, b: BallotStyleData) =>
    find(election.precincts, (p) => p.id === a.precinctId).name.localeCompare(
      find(election.precincts, (p) => p.id === b.precinctId).name,
      undefined,
      sortOptions
    );
}

export function sortBallotStyleDataByStyle(
  election: Election,
  styles: readonly BallotStyleData[]
): BallotStyleData[] {
  return sortBy(
    styles,
    ballotStyleComparator,
    makePrecinctComparator(election)
  );
}

export function sortBallotStyleDataByPrecinct(
  election: Election,
  styles: readonly BallotStyleData[]
): BallotStyleData[] {
  return sortBy(
    styles,
    makePrecinctComparator(election),
    ballotStyleComparator
  );
}

export function getBallotStylesDataByStyle(
  election: Election
): BallotStyleData[] {
  return sortBallotStyleDataByStyle(election, getBallotStylesData(election));
}

export function getLanguageByLocaleCode(localeCode: string): string {
  return LANGUAGES[localeCode.split('-')[0]] ?? localeCode;
}

export function getHumanBallotLanguageFormat(locales: BallotLocale): string {
  return !locales.secondary
    ? getLanguageByLocaleCode(locales.primary)
    : `${getLanguageByLocaleCode(locales.primary)}/${getLanguageByLocaleCode(
        locales.secondary
      )}`;
}

export function getBallotPath({
  ballotStyleId,
  electionDefinition,
  precinctId,
  locales,
  ballotMode,
  isAbsentee,
  variant,
  extension = '.pdf',
}: {
  ballotStyleId: BallotStyleId;
  electionDefinition: ElectionDefinition;
  precinctId: PrecinctId;
  locales: BallotLocale;
  ballotMode: Admin.BallotMode;
  isAbsentee: boolean;
  variant?: string;
  extension?: string;
}): string {
  const { election } = electionDefinition;
  const precinctName = isSuperBallotStyle(ballotStyleId)
    ? 'All'
    : getPrecinctById({ election, precinctId })?.name;
  assert(typeof precinctName !== 'undefined');

  return `election-${getDisplayElectionHash(
    electionDefinition
  )}-precinct-${dashify(
    precinctName
  )}-id-${precinctId}-style-${ballotStyleId}-${getHumanBallotLanguageFormat(
    locales
  ).replace(/[^a-z]+/gi, '-')}-${ballotMode}${isAbsentee ? '-absentee' : ''}${
    variant ? `-${variant}` : ''
  }${extension}`;
}

export function getBallotArchiveFilename(
  electionDefinition: ElectionDefinition,
  ballotMode: Admin.BallotMode,
  isAbsentee: boolean
): string {
  return `ballot-pdfs-election-${getDisplayElectionHash(
    electionDefinition
  )}-${ballotMode}${isAbsentee ? '-absentee' : ''}`;
}

export function getContestsForPrecinct(
  election: Election,
  precinctId: PrecinctId
): AnyContest[] {
  const precinct = election.precincts.find((p) => p.id === precinctId);
  if (precinct === undefined) {
    return [];
  }
  const precinctBallotStyles = election.ballotStyles.filter((bs) =>
    bs.precincts.includes(precinct.id)
  );

  return election.contests.filter((c) => {
    const districts = precinctBallotStyles
      .filter((bs) => {
        const contestPartyId = c.type === 'candidate' ? c.partyId : undefined;
        return bs.partyId === contestPartyId;
      })
      .flatMap((bs) => bs.districts);
    return districts.includes(c.districtId);
  });
}
