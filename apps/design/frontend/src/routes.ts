/* eslint-disable @typescript-eslint/ban-types */
import { typedAs } from '@votingworks/basics';
import type {
  ElectionInfo,
  UserFeaturesConfig,
} from '@votingworks/design-backend';
import { ResultsReportingPath } from '@votingworks/design-backend';
import {
  ElectionId,
  ElectionStringKey,
  SystemSettings,
} from '@votingworks/types';
import { Route } from '@votingworks/ui';

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
        audio: (p: { stringKey: ':stringKey' | ElectionStringKey }) =>
          `${root}/info/audio/${p.stringKey}`,
      },
      districts: {
        root: {
          title: 'Districts',
          path: `${root}/districts`,
        },
        audio: (p: {
          stringKey: ':stringKey' | ElectionStringKey;
          subkey: ':subkey' | (string & {});
        }) => `${root}/districts/audio/${p.stringKey}/${p.subkey}`,
        edit: {
          title: 'Edit District',
          path: `${root}/districts/edit`,
        },
      },
      precincts: {
        root: {
          title: 'Precincts',
          path: `${root}/precincts`,
        },
        add: {
          title: 'Add Precinct',
          path: `${root}/precincts/add`,
        },
        audio: (p: {
          precinctId: ':precinctId' | (string & {});
          stringKey: ':stringKey' | ElectionStringKey;
          subkey: ':subkey' | (string & {});
        }) =>
          `${root}/precincts/${p.precinctId}/audio/${p.stringKey}/${p.subkey}`,
        edit: (precinctId: string) => ({
          title: 'Edit Precinct',
          path: `${root}/precincts/${precinctId}/edit`,
        }),
        view: (precinctId: string) => ({
          title: 'Precinct Info',
          path: `${root}/precincts/${precinctId}`,
        }),
      },
      parties: {
        root: {
          title: 'Parties',
          path: `${root}/parties`,
        },
        audio: (p: {
          stringKey: ':stringKey' | ElectionStringKey;
          subkey: ':subkey' | (string & {});
        }) => `${root}/parties/audio/${p.stringKey}/${p.subkey}`,
        edit: {
          title: 'Parties',
          path: `${root}/parties/edit`,
        },
      },
      contests: {
        root: {
          title: 'Contests',
          path: `${root}/contests`,
        },
        add: {
          title: 'Add Contest',
          path: `${root}/contests/add`,
        },
        audio: (p: {
          contestId: ':contestId' | (string & {});
          stringKey: ':stringKey' | ElectionStringKey;
          subkey: ':subkey' | (string & {});
        }) =>
          `${root}/contests/${p.contestId}/audio/${p.stringKey}/${p.subkey}`,
        edit: (contestId: string) => ({
          title: 'Edit Contest',
          path: `${root}/contests/${contestId}/edit`,
        }),
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
      reports: {
        root: {
          title: 'Live Reports',
          path: `${root}/reports`,
        },
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

export const rootNavRoutes: Route[] = [];
export function electionNavRoutes(
  electionInfo: ElectionInfo,
  userFeatures: UserFeaturesConfig,
  electionSystemSettings: SystemSettings
): Route[] {
  const electionRoutes = routes.election(electionInfo.electionId);
  return [
    electionRoutes.electionInfo.root,
    electionRoutes.districts.root,
    electionRoutes.precincts.root,
    electionRoutes.parties.root,
    electionRoutes.contests.root,
    electionRoutes.ballots.root,
    ...(userFeatures.SYSTEM_SETTINGS_SCREEN
      ? [electionRoutes.systemSettings]
      : []),
    ...(userFeatures.EXPORT_SCREEN ? [electionRoutes.export] : []),
    ...(electionSystemSettings.quickResultsReportingUrl
      ? [electionRoutes.reports.root]
      : []),
    ...(electionInfo.externalSource === 'ms-sems'
      ? [electionRoutes.convertResults]
      : []),
  ];
}
