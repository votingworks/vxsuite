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
          path: `${root}/precincts/${precinctId}/edit`,
        }),
        view: (precinctId: string) => ({
          title: 'Edit Precinct',
          path: `${root}/precincts/${precinctId}`,
        }),
      },
      districts2: {
        root: {
          title: 'Districts',
          path: `${root}/districts2`,
        },
        edit: {
          title: 'Districts',
          path: `${root}/districts2/edit`,
        },
        audio: (p: {
          stringKey: ':stringKey' | ElectionStringKey;
          subkey: ':subkey' | (string & {});
        }) => {
          const subpath = p.subkey ? `/${p.subkey}` : '';
          return `${root}/districts2/audio/${p.stringKey}${subpath}`;
        },
      },
      precincts2: {
        root: {
          title: 'Precincts',
          path: `${root}/precincts2`,
        },
        add: {
          title: 'Precincts',
          path: `${root}/precincts2/add`,
        },
        edit: (precinctId: string) => ({
          title: 'Precinct',
          path: `${root}/precincts2/${precinctId}/edit`,
        }),
        view: (precinctId: string) => ({
          title: 'Precinct',
          path: `${root}/precincts2/${precinctId}`,
        }),
        audio: (
          precinctId: ':precinctId' | (string & {}),
          ttsMode: ':ttsMode' | TtsExportSource,
          stringKey: ':stringKey' | ElectionStringKey,
          subkey: ':subkey' | (string & {})
        ) => {
          const precinctsRoot = `${root}/precincts2/${precinctId}`;
          const subpath = subkey ? `/${subkey}` : '';

          return `${precinctsRoot}/audio/${ttsMode}/${stringKey}${subpath}`;
        },
      },
      parties: {
        root: {
          title: 'Parties',
          path: `${root}/parties-old`,
        },
        addParty: {
          title: 'Add Party',
          path: `${root}/parties-old/add`,
        },
        editParty: (partyId: string) => ({
          title: 'Edit Party',
          path: `${root}/parties-old/${partyId}`,
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
      parties2: {
        root: {
          title: 'Parties',
          path: `${root}/parties`,
        },
        edit: {
          title: 'Parties',
          path: `${root}/parties/edit`,
        },
        audio: (p: {
          stringKey: ':stringKey' | ElectionStringKey;
          subkey: ':subkey' | (string & {});
        }) => {
          const subpath = p.subkey ? `/${p.subkey}` : '';
          return `${root}/parties/audio/${p.stringKey}${subpath}`;
        },
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
            stringKey: ':stringKey' | (string & {}),
            subkey?: string
          ) => {
            const subpath = subkey ? `/${subkey}` : '';
            return `${root}/ballots/audio/${ttsMode}/${stringKey}${subpath}`;
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
    electionRoutes.electionInfo.root,
    // electionRoutes.districts.root,
    // electionRoutes.precincts.root,
    electionRoutes.districts2.root,
    electionRoutes.precincts2.root,
    // electionRoutes.parties.root,
    electionRoutes.parties2.root,
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
