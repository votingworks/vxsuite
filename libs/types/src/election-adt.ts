import { throwIllegalValue } from '@votingworks/utils';
import {
  AdjudicationReason,
  BallotLayout,
  BallotStrings,
  GridLayout,
  MarkThresholds,
  Translations,
  Election as VxElectionData,
  Party as VxPartyData,
} from './election';

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
  name(): string;
}

export interface Party {
  name(): string;
  abbreviation(): string;
}

type ContestType = 'candidate' | 'ballot-measure' | 'ms-either-neither';

interface BaseContest {
  readonly type: ContestType;
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
  name(): string;
  party(): Party | undefined;
  // TODO do we need these fields in election def?
  // isWriteIn?: boolean;
  // writeInIndex?: number;
}

export interface BallotMeasureContest extends BaseContest {
  readonly type: 'ballot-measure';
  description(): string;
  shortTitle(): string | undefined;
  options(): readonly BallotMeasureOption[]; // Replaces yesOption/noOption
}

export interface BallotMeasureOption {
  label(): string;
}

export type Contest = CandidateContest | BallotMeasureContest;

export interface BallotStyle {
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

function buildElectionFromVxf(electionData: VxElectionData): Election {
  function buildParty(partyData: VxPartyData) {
    return {
      name: () => partyData.name,
      abbreviation: () => partyData.abbrev,
    };
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
        name: () => precinct.name,
      }));
    },

    parties(): readonly Party[] {
      return electionData.parties.map(buildParty);
    },

    contests(): readonly Contest[] {
      return electionData.contests.map((contest) => {
        switch (contest.type) {
          case 'candidate': {
            return {
              type: 'candidate',
              title: () => contest.title,
              party: () => {
                const partyData =
                  contest.partyId &&
                  electionData.parties.find(
                    (party) => party.id === contest.partyId
                  );
                return partyData && buildParty(partyData);
              },
              votesAllowed: () => contest.seats,
              candidates: () => [], // TODO
              allowWriteIns: () => contest.allowWriteIns,
            };
          }
          case 'yesno': {
            throw new Error('not implemented');
          }
          case 'ms-either-neither': {
            throw new Error('not implemented');
          }
          default:
            throwIllegalValue(contest);
        }
      });
    },

    ballotStyles(): readonly BallotStyle[] {
      return []; // TODO
    },
  };
}
