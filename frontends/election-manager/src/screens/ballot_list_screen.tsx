import React, { useContext, useState } from 'react';
import styled from 'styled-components';
import pluralize from 'pluralize';

import { assert, find } from '@votingworks/utils';
import {
  Button,
  SegmentedButton,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
  NoWrap,
  Prose,
  Table,
  TD,
} from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';

import { routerPaths } from '../router_paths';
import { LinkButton } from '../components/link_button';
import {
  getBallotStylesData,
  getSuperBallotStyleData,
  isSuperBallotStyle,
  sortBallotStyleDataByPrecinct,
  sortBallotStyleDataByStyle,
} from '../utils/election';
import { NavigationScreen } from '../components/navigation_screen';
import { ExportElectionBallotPackageModalButton } from '../components/export_election_ballot_package_modal_button';
import { ExportBallotPdfsButton } from '../components/export_ballot_pdfs_button';
import { PrintAllBallotsButton } from '../components/print_all_ballots_button';
import { canViewAndPrintBallotsWithConverter } from '../utils/can_view_and_print_ballots_with_converter';

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 1rem;
`;

export function BallotListScreen(): JSX.Element {
  const { auth, converter, configuredAt, electionDefinition } =
    useContext(AppContext);
  assert(electionDefinition && typeof configuredAt === 'string');
  const { election } = electionDefinition;
  const canViewAndPrintBallots = canViewAndPrintBallotsWithConverter(converter);

  const allBallotStyles = getBallotStylesData(election);
  const ballotLists = [
    sortBallotStyleDataByStyle(election, allBallotStyles),
    sortBallotStyleDataByPrecinct(election, allBallotStyles),
  ];
  if (isSystemAdministratorAuth(auth)) {
    const superBallotStyleData = getSuperBallotStyleData(election);
    ballotLists[0].unshift(superBallotStyleData);
    ballotLists[1].unshift(superBallotStyleData);
  }
  const [ballotView, setBallotView] = useState(1);
  function sortByStyle() {
    return setBallotView(0);
  }
  function sortByPrecinct() {
    return setBallotView(1);
  }

  const ballots = ballotLists[ballotView];

  if (!canViewAndPrintBallots) {
    return (
      <NavigationScreen>
        <Header>
          <Prose>
            <p>This election uses custom ballots not produced by VxAdmin.</p>
            <p>
              The Ballot Package is still used to configure VxScan, the ballot
              scanner.
            </p>
            {isElectionManagerAuth(auth) ? (
              <p>
                <ExportElectionBallotPackageModalButton />
              </p>
            ) : (
              <p>
                <em>
                  Insert Election Manager card to save the Ballot Package.
                </em>
              </p>
            )}
          </Prose>
        </Header>
      </NavigationScreen>
    );
  }

  return (
    <NavigationScreen>
      <Header>
        <Prose maxWidth={false}>
          <p>
            {`Sort ${pluralize('ballot', ballots.length, true)} by: `}
            <SegmentedButton>
              <Button
                small
                onPress={sortByPrecinct}
                disabled={ballotView === 1}
              >
                Precinct
              </Button>
              <Button small onPress={sortByStyle} disabled={ballotView === 0}>
                Style
              </Button>
            </SegmentedButton>
          </p>
        </Prose>

        <Prose maxWidth={false}>
          <p>
            <PrintAllBallotsButton />{' '}
            {isElectionManagerAuth(auth) && (
              <React.Fragment>
                <ExportBallotPdfsButton />{' '}
                <ExportElectionBallotPackageModalButton />
              </React.Fragment>
            )}
          </p>
        </Prose>
      </Header>
      <Table>
        <thead>
          <tr>
            <TD as="th" />
            <TD as="th">Precinct</TD>
            <TD as="th">Ballot Style</TD>
            <TD as="th">Contests</TD>
          </tr>
        </thead>
        <tbody>
          {ballots.map((ballot) => {
            const precinctName = isSuperBallotStyle(ballot.ballotStyleId)
              ? 'All'
              : find(election.precincts, (p) => p.id === ballot.precinctId)
                  .name;
            return (
              <tr key={ballot.ballotStyleId + ballot.precinctId}>
                <TD textAlign="right" nowrap>
                  <LinkButton
                    fullWidth
                    small
                    to={routerPaths.ballotsView(ballot)}
                  >
                    View Ballot
                  </LinkButton>
                </TD>
                <TD>
                  <NoWrap>{precinctName}</NoWrap>
                </TD>
                <TD>
                  {isSuperBallotStyle(ballot.ballotStyleId)
                    ? 'All'
                    : ballot.ballotStyleId}
                </TD>
                <TD>{ballot.contestIds.length}</TD>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </NavigationScreen>
  );
}
