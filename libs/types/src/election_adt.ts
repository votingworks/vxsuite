import { find, throwIllegalValue } from '@votingworks/basics';
import {
  AdjudicationReason,
  BallotLayout,
  BallotStrings,
  GridLayout,
  MarkThresholds,
  Translations,
  Election as VxElectionData,
  Party as VxPartyData,
  AnyContest as VxContestData,
} from './election';

export function findById<T extends { id: string }>(
  array: readonly T[],
  id: string
): T {
  return find(array, (element) => element.id === id);
}

export interface State {
  name(): string;
}

export interface County {
  name(): string;
}

export interface District {
  name(): string;
}

export interface Precinct {
  readonly id: string;
  name(): string;
}

export interface Party {
  name(): string;
  ballotLabel(): string;
  abbreviation(): string;
}

type ContestType = 'candidate' | 'ballot-measure';

interface BaseContest {
  readonly type: ContestType;
  readonly id: string;
  title(): string;
  party(): Party | undefined;
}

export interface CandidateContest extends BaseContest {
  readonly type: 'candidate';
  votesAllowed(): number; // Replaces seats
  candidates(): readonly Candidate[];
  allowWriteIns(): boolean;
}

export interface Candidate {
  readonly id: string;
  name(): string;
  party(): Party | undefined;
}

export interface BallotMeasureContest extends BaseContest {
  readonly type: 'ballot-measure';
  description(): string;
  yesOption(): BallotMeasureOption;
  noOption(): BallotMeasureOption;
}

export interface BallotMeasureOption {
  readonly id: string;
  label(): string;
}

export type Contest = CandidateContest | BallotMeasureContest;

export interface BallotStyle {
  readonly id: string;
  precincts(): readonly Precinct[];
  contests(): readonly Contest[];
  party(): Party | undefined;
}

export interface Election {
  // Logical election
  title(): string;
  date(): string;
  state(): State;
  county(): County;
  districts(): readonly District[];
  precincts(): readonly Precinct[];
  parties(): readonly Party[];
  contests(): readonly Contest[];
  ballotStyles(): readonly BallotStyle[];

  // The rest of the fields below are the same as in the original VXF election
  // definition data structure. They are deprecated, since we will be moving
  // these features to CDF in the future. For now, this data will be appended as
  // an extra VX-specific blob at the end of the CDF. We don't both making
  // accessors for them now, since they will change.

  // Physical ballot
  /** @deprecated */
  ballotLayout?: BallotLayout;
  /** @deprecated */
  gridLayouts?: readonly GridLayout[];
  /** @deprecated */
  seal?: string;
  /** @deprecated */
  sealUrl?: string;
  /** @deprecated */
  quickResultsReportingUrl?: string;

  // Election settings
  /** @deprecated */
  markThresholds?: MarkThresholds;
  /** @deprecated */
  centralScanAdjudicationReasons?: readonly AdjudicationReason[];
  /** @deprecated */
  precinctScanAdjudicationReasons?: readonly AdjudicationReason[];

  // Localization
  /** @deprecated */
  _lang?: Translations;
  /** @deprecated */
  ballotStrings?: BallotStrings;
}

export function buildElectionFromVxf(electionData: VxElectionData): Election {
  function buildParty(partyData: VxPartyData) {
    return {
      name: () => partyData.fullName,
      ballotLabel: () => partyData.name,
      abbreviation: () => partyData.abbrev,
    };
  }

  function findAndBuildParty(partyId?: string): Party | undefined {
    const partyData = electionData.parties.find(
      (party) => party.id === partyId
    );
    return partyData && buildParty(partyData);
  }

  function buildContest(contestData: VxContestData): Contest {
    switch (contestData.type) {
      case 'candidate': {
        return {
          type: 'candidate',
          id: contestData.id,
          title: () => contestData.title,
          party: () => findAndBuildParty(contestData.partyId),
          votesAllowed: () => contestData.seats,
          candidates: () => {
            return contestData.candidates.map((candidateData) => ({
              id: candidateData.id,
              name: () => candidateData.name,
              party: () => findAndBuildParty(candidateData.partyIds?.[0]),
            }));
          },
          allowWriteIns: () => contestData.allowWriteIns,
        };
      }
      case 'yesno': {
        return {
          type: 'ballot-measure',
          id: contestData.id,
          title: () => contestData.title,
          party: () => findAndBuildParty(contestData.partyId),
          description: () => contestData.description,
          yesOption: () => ({
            id: contestData.yesOption?.id ?? 'yes',
            label: () => contestData.yesOption?.label ?? 'Yes',
          }),
          noOption: () => ({
            id: contestData.noOption?.id ?? 'no',
            label: () => contestData.noOption?.label ?? 'No',
          }),
        };
      }
      default:
        return throwIllegalValue(contestData);
    }
  }

  return {
    ...electionData,

    title(): string {
      return electionData.title;
    },

    date(): string {
      return electionData.date;
    },

    state(): State {
      const { state } = electionData;
      return { name: () => state };
    },

    county(): County {
      const { county } = electionData;
      return { name: () => county.name };
    },

    districts(): readonly District[] {
      return electionData.districts.map((district) => ({
        name: () => district.name,
      }));
    },

    precincts(): readonly Precinct[] {
      return electionData.precincts.map((precinct) => ({
        id: precinct.id,
        name: () => precinct.name,
      }));
    },

    parties(): readonly Party[] {
      return electionData.parties.map(buildParty);
    },

    contests(): readonly Contest[] {
      return electionData.contests.map(buildContest);
    },

    ballotStyles(): readonly BallotStyle[] {
      return electionData.ballotStyles.map((ballotStyle) => ({
        id: ballotStyle.id,
        precincts: () =>
          ballotStyle.precincts.map((precinctId) => {
            const precinctData = find(
              electionData.precincts,
              (precinct) => precinct.id === precinctId
            );
            return {
              id: precinctId,
              name: () => precinctData.name,
            };
          }),
        contests: () =>
          electionData.contests
            .filter(
              (contest) =>
                ballotStyle.districts.includes(contest.districtId) &&
                (ballotStyle.partyId === contest.partyId || !contest.partyId)
            )
            .map(buildContest),
        party: () => findAndBuildParty(ballotStyle.partyId),
      }));
    },
  };
}
