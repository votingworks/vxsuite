import {
  MainHeader,
  H1,
  MainContent,
  Callout,
  H2,
  Font,
  Button,
  Table,
  Main,
  Card,
  Icons,
  LabelledText,
} from '@votingworks/ui';
import debounce from 'lodash.debounce';
import React, { useState, useMemo } from 'react';
import type { Voter, VoterSearchParams } from '@votingworks/pollbook-backend';
import styled from 'styled-components';
import { Column, Form, Row, InputGroup } from './layout';
import { NoNavScreen } from './nav_screen';
import { getCheckInCounts, searchVoters } from './api';

const VoterTableWrapper = styled(Card)`
  overflow: hidden;
  > div {
    overflow-y: auto;
    padding: 0;
  }
`;

const VoterTable = styled(Table)`
  td {
    padding: 1rem 1rem;
  }

  tr:nth-child(odd) {
    background-color: ${(p) => p.theme.colors.container};
  }
  tr:last-child {
    td {
      border-bottom: none;
    }
  }
`;

export function VoterSearchScreen({
  onSelect,
}: {
  onSelect: (voter: Voter) => void;
}): JSX.Element {
  const getCheckInCountsQuery = getCheckInCounts.useQuery();

  const [search, setSearch] = useState<VoterSearchParams>({
    lastName: '',
    firstName: '',
  });
  const [debouncedSearch, setDebouncedSearch] =
    useState<VoterSearchParams>(search);
  const updateDebouncedSearch = useMemo(
    () => debounce(setDebouncedSearch, 500),
    []
  );
  function updateSearch(newSearch: Partial<VoterSearchParams>) {
    setSearch({ ...search, ...newSearch });
    updateDebouncedSearch({ ...search, ...newSearch });
  }
  const searchVotersQuery = searchVoters.useQuery(debouncedSearch);

  return (
    <NoNavScreen>
      <Main flexColumn>
        <MainHeader>
          <Row
            style={{ alignItems: 'center', justifyContent: 'space-between' }}
          >
            <H1>Search Voters</H1>
            <div>
              {getCheckInCountsQuery.data && (
                <Row style={{ gap: '1rem', fontSize: '1.2rem' }}>
                  <LabelledText label="Total Check-ins">
                    {getCheckInCountsQuery.data.allMachines.toLocaleString()}
                  </LabelledText>
                  <LabelledText label="Machine Check-ins">
                    {getCheckInCountsQuery.data.thisMachine.toLocaleString()}
                  </LabelledText>
                </Row>
              )}
            </div>
          </Row>
        </MainHeader>
        <MainContent>
          <Column style={{ gap: '1rem', height: '100%', overflowY: 'hidden' }}>
            <Form>
              <Row style={{ gap: '1rem' }}>
                <InputGroup label="Last Name">
                  <input
                    value={search.lastName}
                    onChange={(e) =>
                      updateSearch({
                        lastName: e.target.value.toUpperCase(),
                      })
                    }
                    style={{ flex: 1 }}
                    type="text"
                  />
                </InputGroup>
                <InputGroup label="First Name">
                  <input
                    value={search.firstName}
                    onChange={(e) =>
                      updateSearch({
                        firstName: e.target.value.toUpperCase(),
                      })
                    }
                    type="text"
                  />
                </InputGroup>
              </Row>
            </Form>
            {searchVotersQuery.data &&
              (typeof searchVotersQuery.data === 'number' ? (
                <Callout icon="Info" color="neutral">
                  <div>
                    Voters matched: {searchVotersQuery.data}. Refine your search
                    further to view results.
                  </div>
                </Callout>
              ) : searchVotersQuery.data.length === 0 ? (
                <Callout icon="Info" color="neutral">
                  No voters matched.
                </Callout>
              ) : (
                <React.Fragment>
                  <div>Voters matched: {searchVotersQuery.data.length}</div>
                  <VoterTableWrapper>
                    <VoterTable>
                      <tbody>
                        {searchVotersQuery.data.map((voter) => (
                          <tr key={voter.voterId}>
                            <td>
                              <H2 style={{ margin: 0 }}>
                                {voter.lastName}, {voter.firstName}
                              </H2>
                              {voter.party}
                            </td>
                            <td>
                              {voter.streetNumber} {voter.streetName}
                              <br />
                              <Font noWrap>
                                {voter.postalCityTown}, {voter.state},{' '}
                                {voter.postalZip5}-{voter.zip4}
                              </Font>
                            </td>
                            <td>
                              {voter.checkIn ? (
                                <Row style={{ gap: '0.5rem' }}>
                                  <Icons.Done /> Checked In
                                </Row>
                              ) : (
                                <Button
                                  style={{ flexWrap: 'nowrap' }}
                                  rightIcon="Next"
                                  color="primary"
                                  onPress={() => onSelect(voter)}
                                >
                                  <Font noWrap>Start Check-In</Font>
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </VoterTable>
                  </VoterTableWrapper>
                </React.Fragment>
              ))}
          </Column>
        </MainContent>
      </Main>
    </NoNavScreen>
  );
}
