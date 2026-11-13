import { typedAs } from '@votingworks/basics';
import type {
  ElectionInfo,
  StateFeaturesConfig,
  UserFeaturesConfig,
  ResultsReportingPath,
} from '@votingworks/hub-backend';
import type { ElectionId, SystemSettings } from '@votingworks/types';
import type { Route } from '@votingworks/ui';

export const resultsRoutes = {
  root: {
    title: 'Results Reported',
    path: typedAs<ResultsReportingPath>('/report'),
  },
} as const;

export const routes = {
  root: {
    title: 'Elections',
    path: '/',
  },
  election: (id: string) => {
    const root = `/elections/${id}`;
    return {
      root: {
        title: 'Election',
        path: root,
      },
      electionInfo: {
        root: {
          title: 'Election Info',
          path: `${root}/info`,
        },
      },
      districts: {
        root: {
          title: 'Districts',
          path: `${root}/districts`,
        },
      },
      precincts: {
        root: {
          title: 'Precincts',
          path: `${root}/precincts`,
        },
        view: (precinctId: string) => ({
          title: 'Precinct Info',
          path: `${root}/precincts/${precinctId}`,
        }),
      },
      pollingPlaces: {
        root: {
          title: 'Polling Places',
          path: `${root}/polling-places`,
        },
        view: (placeId: ':placeId' | (string & {})) =>
          `${root}/polling-places/${placeId}`,
      },
      parties: {
        root: {
          title: 'Parties',
          path: `${root}/parties`,
        },
      },
      contests: {
        root: {
          title: 'Contests',
          path: `${root}/contests`,
        },
        view: (contestId: string) => ({
          title: 'Edit Contest',
          path: `${root}/contests/${contestId}`,
        }),
      },
      ballots: {
        root: {
          title: 'Proof Ballots',
          path: `${root}/ballots`,
        },
        ballotStyles: {
          title: 'Ballot Styles',
          path: `${root}/ballots/ballot-styles`,
        },
        ballotLayout: {
          title: 'Ballot Layout',
          path: `${root}/ballots/layout`,
        },
        viewBallot: (ballotStyleId: string, precinctId: string) => ({
          title: 'View Ballot',
          path: `${root}/ballots/${ballotStyleId}/${precinctId}`,
        }),
      },
      systemSettings: {
        title: 'System Settings',
        path: `${root}/system-settings`,
      },
      export: {
        title: 'Export',
        path: `${root}/export`,
      },
      downloads: {
        title: 'Downloads',
        path: `${root}/downloads`,
      },
      reports: {
        root: {
          title: 'Live Reports',
          path: `${root}/reports`,
        },
        allVotingGroups: {
          title: 'All Voting Groups',
          path: `${root}/reports/all`,
        },
        votingGroup: (votingGroup: string) => ({
          title: 'Voting Group',
          path: `${root}/reports/group/${votingGroup}`,
        }),
        allPrecinctResults: {
          title: 'All Precincts Tally Report',
          path: `${root}/reports/tally-all-precincts`,
        },
        byPrecinctResults: (precinctId: string) => ({
          title: 'Tally Report by Precinct',
          path: `${root}/reports/tally-by-precinct/${precinctId}`,
        }),
      },
      convertResults: {
        title: 'Convert Results',
        path: `${root}/convert-results`,
      },
    };
  },
} as const;

export interface ElectionIdParams {
  electionId: ElectionId;
}
export const electionParamRoutes = routes.election(':electionId');

export function electionNavRoutes(
  electionInfo: ElectionInfo,
  systemSettings: SystemSettings,
  stateFeatures: StateFeaturesConfig
): Route[] {
  const r = routes.election(electionInfo.electionId);

  const nav: Array<Route | undefined | false> = [
    r.electionInfo.root,
    r.districts.root,
    r.precincts.root,
    stateFeatures.EDIT_POLLING_PLACES && r.pollingPlaces.root,
    r.parties.root,
    r.contests.root,
    r.ballots.root,
    r.downloads,
    !!systemSettings.quickResultsReportingUrl && r.reports.root,
    electionInfo.externalSource === 'ms-sems' && r.convertResults,
  ];

  return nav.filter((route) => !!route);
}

// For screens only relevant for internal users
export function adminElectionNavRoutes(
  electionInfo: ElectionInfo,
  userFeatures: UserFeaturesConfig
): Route[] {
  const r = routes.election(electionInfo.electionId);

  const nav: Array<Route | undefined | false> = [
    userFeatures.SYSTEM_SETTINGS_SCREEN && r.systemSettings,
    userFeatures.EXPORT_SCREEN && r.export,
  ];

  return nav.filter((route) => !!route);
}
