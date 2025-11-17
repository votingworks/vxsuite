import type { UserFeaturesConfig } from '@votingworks/design-backend';
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
      geography: {
        root: {
          title: 'Geography',
          path: `${root}/geography`,
        },
        districts: {
          root: {
            title: 'Districts',
            path: `${root}/geography/districts`,
          },
          addDistrict: {
            title: 'Add District',
            path: `${root}/geography/districts/add`,
          },
          editDistrict: (districtId: string) => ({
            title: 'Edit District',
            path: `${root}/geography/districts/${districtId}`,
          }),
        },
        precincts: {
          root: {
            title: 'Precincts',
            path: `${root}/geography/precincts`,
          },
          addPrecinct: {
            title: 'Add Precinct',
            path: `${root}/geography/precincts/add`,
          },
          editPrecinct: (precinctId: string) => ({
            title: 'Edit Precinct',
            path: `${root}/geography/precincts/${precinctId}`,
          }),
        },
      },
      districts: {
        root: {
          title: 'Districts',
          path: `${root}/districts`,
        },
        edit: {
          title: 'Districts',
          path: `${root}/districts/edit`,
        },
      },
      precincts: {
        root: {
          title: 'Precincts',
          path: `${root}/precincts`,
        },
        add: {
          title: 'Precincts',
          path: `${root}/precincts/add`,
        },
        edit: (precinctId: string) => ({
          title: 'Precinct',
          path: `${root}/precincts/${precinctId}/edit`,
        }),
        view: (precinctId: string) => ({
          title: 'Precinct',
          path: `${root}/precincts/${precinctId}`,
        }),
        audio: {
          manage: (
            // eslint-disable-next-line @typescript-eslint/ban-types
            precinctId: ':precinctId' | (string & {}),
            ttsMode: TtsExportSource | ':ttsMode',
            stringKey: ':stringKey' | ElectionStringKey,
            // eslint-disable-next-line @typescript-eslint/ban-types
            subkey: ':subkey' | (string & {})
          ) => {
            const subpath = subkey ? `/${subkey}` : '';

            return {
              title: 'Audio',
              path: `${root}/precincts/${precinctId}/audio/${ttsMode}/${stringKey}${subpath}`,
            };
          },
        },
      },
      contests: {
        root: {
          title: 'Contests',
          path: `${root}/contests`,
        },
        contests: {
          root: {
            title: 'Contests',
            path: `${root}/contests/contests`,
          },
          addContest: {
            title: 'Add Contest',
            path: `${root}/contests/contests/add`,
          },
          editContest: (contestId: string) => ({
            title: 'Edit Contest',
            path: `${root}/contests/contests/${contestId}`,
          }),
        },
        parties: {
          root: {
            title: 'Parties',
            path: `${root}/contests/parties`,
          },
          addParty: {
            title: 'Add Party',
            path: `${root}/contests/parties/add`,
          },
          editParty: (partyId: string) => ({
            title: 'Edit Party',
            path: `${root}/contests/parties/${partyId}`,
          }),
        },
      },
      parties: {
        root: {
          title: 'Parties',
          path: `${root}/parties`,
        },
        edit: {
          title: 'Parties',
          path: `${root}/parties/edit`,
        },
      },
      contests2: {
        root: {
          title: 'Contests',
          path: `${root}/contests2`,
        },
        add: {
          title: 'Add Contest',
          path: `${root}/contests2/add`,
        },
        edit: (contestId: string) => ({
          title: 'Edit Contest',
          path: `${root}/contests2/${contestId}/edit`,
        }),
        view: (contestId: string) => ({
          title: 'Edit Contest',
          path: `${root}/contests2/${contestId}`,
        }),
        audio: {
          manage: (
            // eslint-disable-next-line @typescript-eslint/ban-types
            contestId: ':contestId' | (string & {}),
            ttsMode: TtsExportSource | ':ttsMode',
            stringKey: ':stringKey' | ElectionStringKey,
            // eslint-disable-next-line @typescript-eslint/ban-types
            subkey: ':subkey' | (string & {})
          ) => {
            const subpath = subkey ? `/${subkey}` : '';

            return {
              title: 'Audio',
              path: `${root}/contests2/${contestId}/audio/${ttsMode}/${stringKey}${subpath}`,
            };
          },
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
            // eslint-disable-next-line @typescript-eslint/ban-types
            stringKey: ':stringKey' | (string & {}),
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
  features: UserFeaturesConfig,
  electionSystemSettings: SystemSettings
): Route[] {
  const electionRoutes = routes.election(electionId);
  return [
    electionRoutes.electionInfo,
    electionRoutes.districts.root,
    electionRoutes.precincts.root,
    electionRoutes.parties.root,
    electionRoutes.contests2.root,
    electionRoutes.ballots.root,
    ...(features.SYSTEM_SETTINGS_SCREEN ? [electionRoutes.systemSettings] : []),
    ...(features.EXPORT_SCREEN ? [electionRoutes.export] : []),
    ...(electionSystemSettings.quickResultsReportingUrl
      ? [electionRoutes.reports.root]
      : []),
    ...(features.MS_SEMS_CONVERSION ? [electionRoutes.convertResults] : []),
  ];
}
