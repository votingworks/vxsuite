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
        root: {
          title: 'Election Info',
          path: `${root}/info`,
        },
        audio: (p: {
          // ttsMode: ':ttsMode' | 'default' | TtsExportSource;
          stringKey: ':stringKey' | ElectionStringKey;
        }) => `${root}/info/audio/${p.stringKey}`,
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
        audio: (p: {
          // ttsMode: ':ttsMode' | 'default' | TtsExportSource;
          stringKey: ':stringKey' | ElectionStringKey;
          // eslint-disable-next-line @typescript-eslint/ban-types
          subkey: ':subkey' | (string & {});
        }) => {
          const subpath = p.subkey ? `/${p.subkey}` : '';

          return {
            path: `${root}/districts/audio/${p.stringKey}${subpath}`,
          };
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
            ttsMode: ':ttsMode' | TtsExportSource,
            stringKey: ':stringKey' | ElectionStringKey,
            // eslint-disable-next-line @typescript-eslint/ban-types
            subkey: ':subkey' | (string & {})
          ) => {
            const precinctsRoot = `${root}/precincts/${precinctId}`;
            const subpath = subkey ? `/${subkey}` : '';

            return {
              title: 'Precinct Audio',
              path: `${precinctsRoot}/audio/${ttsMode}/${stringKey}${subpath}`,
            };
          },
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
        audio: {
          manage: (p: {
            // eslint-disable-next-line @typescript-eslint/ban-types
            contestId: ':contestId' | (string & {});
            // ttsMode: ':ttsMode' | 'default' | TtsExportSource;
            stringKey: ':stringKey' | ElectionStringKey;
            // eslint-disable-next-line @typescript-eslint/ban-types
            subkey: ':subkey' | (string & {});
          }) => {
            const subpath = p.subkey ? `/${p.subkey}` : '';

            return {
              path: `${root}/contests/${p.contestId}/audio/${p.stringKey}${subpath}`,
            };
          },
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
          // ttsMode: ':ttsMode' | 'default' | TtsExportSource;
          stringKey: ':stringKey' | ElectionStringKey;
          // eslint-disable-next-line @typescript-eslint/ban-types
          subkey: ':subkey' | (string & {});
        }) => {
          const subpath = p.subkey ? `/${p.subkey}` : '';

          return {
            path: `${root}/parties/audio/${p.stringKey}${subpath}`,
          };
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
    electionRoutes.electionInfo.root,
    // electionRoutes.geography.root,
    // electionRoutes.parties.root,
    electionRoutes.districts.root,
    electionRoutes.precincts.root,
    electionRoutes.parties2.root,
    electionRoutes.contests.root,
    electionRoutes.ballots.root,
    ...(features.SYSTEM_SETTINGS_SCREEN ? [electionRoutes.systemSettings] : []),
    ...(features.EXPORT_SCREEN ? [electionRoutes.export] : []),
    ...(electionSystemSettings.quickResultsReportingUrl
      ? [electionRoutes.reports.root]
      : []),
    ...(features.MS_SEMS_CONVERSION ? [electionRoutes.convertResults] : []),
  ];
}
