import type { UserFeaturesConfig } from '@votingworks/design-backend';
import { ElectionId } from '@votingworks/types';
import { Route } from '@votingworks/ui';

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
      ballotOrderInfo: {
        title: 'Order Ballots',
        path: `${root}/ballot-order-info`,
      },
      systemSettings: {
        title: 'System Settings',
        path: `${root}/system-settings`,
      },
      export: {
        title: 'Export',
        path: `${root}/export`,
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
  features: UserFeaturesConfig
): Route[] {
  const electionRoutes = routes.election(electionId);
  return [
    electionRoutes.electionInfo,
    electionRoutes.geography.root,
    electionRoutes.contests.root,
    electionRoutes.ballots.root,
    electionRoutes.ballotOrderInfo,
    ...(features.SYSTEM_SETTINGS_SCREEN ? [electionRoutes.systemSettings] : []),
    ...(features.EXPORT_SCREEN ? [electionRoutes.export] : []),
  ];
}
