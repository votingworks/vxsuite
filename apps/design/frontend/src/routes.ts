/* eslint-disable @typescript-eslint/ban-types */
import type {
  StateFeaturesConfig,
  UserFeaturesConfig,
} from '@votingworks/design-backend';
import {
  ElectionId,
  ElectionStringKey,
  SystemSettings,
  TtsExportSource,
} from '@votingworks/types';
import { Route } from '@votingworks/ui';

export const resultsRoutes = {
  root: {
    title: 'Results Reported',
    path: '/report',
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
        title: 'Election Info',
        path: `${root}/info`,
      },
      districts: {
        root: {
          title: 'Districts',
          path: `${root}/districts`,
        },
        add: {
          title: 'Add District',
          path: `${root}/districts/add`,
        },
        edit: (districtId: string) => ({
          title: 'Edit District',
          path: `${root}/districts/${districtId}`,
        }),
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
        edit: (precinctId: string) => ({
          title: 'Edit Precinct',
          path: `${root}/precincts/${precinctId}`,
        }),
      },
      parties: {
        root: {
          title: 'Parties',
          path: `${root}/parties`,
        },
        addParty: {
          title: 'Add Party',
          path: `${root}/parties/add`,
        },
        editParty: (partyId: string) => ({
          title: 'Edit Party',
          path: `${root}/parties/${partyId}`,
        }),
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
        }) => {
          const subpath = p.subkey ? `/${p.subkey}` : '';
          return `${root}/contests/${p.contestId}/audio/${p.stringKey}${subpath}`;
        },
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
        audio: {
          root: {
            title: 'Audio',
            path: `${root}/ballots/audio`,
          },
          manage: (
            ttsMode: TtsExportSource | ':ttsMode',
            stringKey: string,
            subkey?: string
          ) => {
            const subpath = subkey ? `/${subkey}` : '';

            return {
              title: 'Audio',
              path: `${root}/ballots/audio/${ttsMode}/${stringKey}${subpath}`,
            };
          },
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
  electionId: ElectionId,
  userFeatures: UserFeaturesConfig,
  stateFeatures: StateFeaturesConfig,
  electionSystemSettings: SystemSettings
): Route[] {
  const electionRoutes = routes.election(electionId);
  return [
    electionRoutes.electionInfo,
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
    ...(stateFeatures.MS_SEMS_CONVERSION
      ? [electionRoutes.convertResults]
      : []),
  ];
}
