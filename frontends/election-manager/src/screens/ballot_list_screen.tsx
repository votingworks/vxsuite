import React, { useContext, useState } from 'react';
import styled from 'styled-components';
import pluralize from 'pluralize';

import { assert, find } from '@votingworks/utils';
import {
  isElectionManagerAuth,
  NoWrap,
  Prose,
  Table,
  TD,
} from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';

import { routerPaths } from '../router_paths';
import { Button, SegmentedButton } from '../components/button';
import { LinkButton } from '../components/link_button';
import {
  getBallotStylesData,
  sortBallotStyleDataByPrecinct,
  sortBallotStyleDataByStyle,
} from '../utils/election';
import { NavigationScreen } from '../components/navigation_screen';
import { ExportElectionBallotPackageModalButton } from '../components/export_election_ballot_package_modal_button';
import { ExportBallotPdfsButton } from '../components/export_ballot_pdfs_button';
import { PrintAllBallotsButton } from '../components/print_all_ballots_button';

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 1rem;
`;

export function BallotListScreen(): JSX.Element {
  const { auth, electionDefinition, configuredAt } = useContext(AppContext);
  assert(electionDefinition && typeof configuredAt === 'string');
  const { election } = electionDefinition;

  const allBallotStyles = getBallotStylesData(election);
  const ballotLists = [
    sortBallotStyleDataByStyle(election, allBallotStyles),
    sortBallotStyleDataByPrecinct(election, allBallotStyles),
  ];
  const [ballotView, setBallotView] = useState(1);
  function sortByStyle() {
    return setBallotView(0);
  }
  function sortByPrecinct() {
    return setBallotView(1);
  }

  const ballots = ballotLists[ballotView];

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
            const precinctName = find(
              election.precincts,
              (p) => p.id === ballot.precinctId
            ).name;
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
                <TD>{ballot.ballotStyleId}</TD>
                <TD>{ballot.contestIds.length}</TD>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </NavigationScreen>
  );
}
