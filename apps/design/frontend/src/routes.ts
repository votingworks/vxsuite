import { Id } from '@votingworks/types';

export interface Route {
  readonly label: string;
  readonly path: string;
}

export const routes = {
  root: {
    label: 'Elections',
    path: '/',
  },
  election: (id: string) => {
    const root = `/elections/${id}`;
    return {
      root: {
        label: 'Election',
        path: root,
      },
      electionInfo: {
        label: 'Election Info',
        path: `${root}/info`,
      },
      geography: {
        root: {
          label: 'Geography',
          path: `${root}/geography`,
        },
        districts: {
          root: {
            label: 'Districts',
            path: `${root}/geography/districts`,
          },
          addDistrict: {
            label: 'Add District',
            path: `${root}/geography/districts/add`,
          },
          editDistrict: (districtId: string) => ({
            label: 'Edit District',
            path: `${root}/geography/districts/${districtId}`,
          }),
        },
        precincts: {
          root: {
            label: 'Precincts',
            path: `${root}/geography/precincts`,
          },
          addPrecinct: {
            label: 'Add Precinct',
            path: `${root}/geography/precincts/add`,
          },
          editPrecinct: (precinctId: string) => ({
            label: 'Edit Precinct',
            path: `${root}/geography/precincts/${precinctId}`,
          }),
        },
      },
      contests: {
        root: {
          label: 'Contests',
          path: `${root}/contests`,
        },
        contests: {
          root: {
            label: 'Contests',
            path: `${root}/contests/contests`,
          },
          addContest: {
            label: 'Add Contest',
            path: `${root}/contests/contests/add`,
          },
          editContest: (contestId: string) => ({
            label: 'Edit Contest',
            path: `${root}/contests/contests/${contestId}`,
          }),
        },
        parties: {
          root: {
            label: 'Parties',
            path: `${root}/contests/parties`,
          },
          addParty: {
            label: 'Add Party',
            path: `${root}/contests/parties/add`,
          },
          editParty: (partyId: string) => ({
            label: 'Edit Party',
            path: `${root}/contests/parties/${partyId}`,
          }),
        },
      },
      ballots: {
        root: {
          label: 'Ballots',
          path: `${root}/ballots`,
        },
        viewBallot: (ballotStyleId: string, precinctId: string) => ({
          label: 'View Ballot',
          path: `${root}/ballots/${ballotStyleId}/${precinctId}`,
        }),
      },
      tabulation: {
        label: 'Tabulation',
        path: `${root}/tabulation`,
      },
      export: {
        label: 'Export',
        path: `${root}/export`,
      },
    };
  },
} as const;

export interface ElectionIdParams {
  electionId: Id;
}
export const electionParamRoutes = routes.election(':electionId');

export const rootNavRoutes: Route[] = [];
export function electionNavRoutes(electionId: string): Route[] {
  const electionRoutes = routes.election(electionId);
  return [
    electionRoutes.electionInfo,
    electionRoutes.geography.root,
    electionRoutes.contests.root,
    electionRoutes.ballots.root,
    electionRoutes.tabulation,
    electionRoutes.export,
  ];
}
