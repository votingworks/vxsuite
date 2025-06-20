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
  Caption,
} from '@votingworks/ui';
import { io } from 'socket.io-client';
import debounce from 'lodash.debounce';
import React, { useState, useMemo, useEffect } from 'react';
import type {
  AamvaDocument,
  Voter,
  VoterCheckIn,
  VoterSearchParams,
} from '@votingworks/pollbook-backend';
import styled from 'styled-components';
import { format } from '@votingworks/utils';
import { throwIllegalValue } from '@votingworks/basics';
import { Column, Form, Row, InputGroup } from './layout';
import { PollWorkerNavScreen } from './nav_screen';
import { getCheckInCounts, searchVoters } from './api';
import {
  AbsenteeModeCallout,
  AddressChange,
  PartyName,
  VoterAddress,
  VoterName,
} from './shared_components';
import { SOCKET_IO_SERVER_ADDRESS } from './globals';

const VoterTableWrapper = styled(Card)`
  overflow: hidden;

  > div {
    overflow-y: auto;
    padding: 0;
  }
`;

const VoterTable = styled(Table)`
  td {
    padding: 1rem;
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

export function createEmptySearchParams(
  includeInactiveVoters: boolean
): VoterSearchParams {
  return {
    lastName: '',
    middleName: '',
    firstName: '',
    suffix: '',
    includeInactiveVoters,
  };
}

export function VoterSearch({
  search,
  setSearch,
  renderAction,
}: {
  search: VoterSearchParams;
  setSearch: (search: VoterSearchParams) => void;
  renderAction: (voter: Voter) => React.ReactNode;
}): JSX.Element {
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

  useEffect(() => {
    const socket = io(SOCKET_IO_SERVER_ADDRESS);
    socket.on('barcode-scan', (data: AamvaDocument) => {
      setDebouncedSearch({
        ...search,
        firstName: data.firstName,
        lastName: data.lastName,
      });
    });
    return () => {
      socket.disconnect();
    };
  }, [search]);

  return (
    <Column style={{ gap: '1rem', height: '100%' }}>
      <Form>
        <Row style={{ gap: '1rem' }}>
          <InputGroup label="Last Name">
            <input
              value={search.lastName}
              data-testid="last-name-input"
              onChange={(e) =>
                updateSearch({
                  lastName: e.target.value.toUpperCase(),
                })
              }
              style={{ flex: 1 }}
              type="text"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </InputGroup>
          <InputGroup label="First Name">
            <input
              value={search.firstName}
              data-testid="first-name-input"
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
                        {voter.nameChange && <Caption>Updated Name</Caption>}
                        <H2 style={{ margin: 0 }}>
                          <VoterName voter={voter} lastNameFirst />
                        </H2>
                        <PartyName party={voter.party} />
                      </td>
                      <td>
                        {voter.addressChange ? (
                          <LabelledText label="Updated Address">
                            <AddressChange address={voter.addressChange} />
                          </LabelledText>
                        ) : (
                          <VoterAddress voter={voter} />
                        )}
                      </td>
                      <td style={{ width: '1%' }}>{renderAction(voter)}</td>
                    </tr>
                  ))}
                </tbody>
              </VoterTable>
            </VoterTableWrapper>
          </React.Fragment>
        ))}
    </Column>
  );
}

export function CheckInDetails({
  checkIn,
}: {
  checkIn: VoterCheckIn;
}): JSX.Element {
  const { identificationMethod } = checkIn;
  const identificationDetails = (() => {
    switch (identificationMethod.type) {
      case 'default':
        return null;
      case 'outOfStateLicense':
        return `OOS DL (${identificationMethod.state})`;
      default:
        throwIllegalValue(identificationMethod);
    }
  })();
  return (
    <Column>
      {checkIn.isAbsentee ? (
        <Font noWrap>
          <Icons.Envelope /> Absentee Checked In
        </Font>
      ) : (
        <Font noWrap>
          <Icons.Done /> Checked In
        </Font>
      )}
      <Caption noWrap>
        {format.localeTime(new Date(checkIn.timestamp))} &bull;{' '}
        {checkIn.machineId}
        {identificationDetails && <span> &bull; {identificationDetails}</span>}
      </Caption>
    </Column>
  );
}

export function VoterSearchScreen({
  search,
  setSearch,
  isAbsenteeMode,
  onSelect,
}: {
  search: VoterSearchParams;
  setSearch: (search: VoterSearchParams) => void;
  isAbsenteeMode: boolean;
  onSelect: (voterId: string) => void;
}): JSX.Element | null {
  const getCheckInCountsQuery = getCheckInCounts.useQuery();

  return (
    <PollWorkerNavScreen>
      <Main flexColumn>
        <MainHeader>
          <Row
            style={{ alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Row style={{ gap: '1rem' }}>
              <H1>Voter Check-In</H1>
            </Row>
            <Row style={{ gap: '1rem' }}>
              {getCheckInCountsQuery.data && (
                <Row style={{ gap: '1rem', fontSize: '1.2rem' }}>
                  <LabelledText label="Total Check-ins">
                    <span data-testid="total-check-ins">
                      {getCheckInCountsQuery.data.allMachines.toLocaleString()}
                    </span>
                  </LabelledText>
                  <LabelledText label="Machine Check-ins">
                    <span data-testid="machine-check-ins">
                      {getCheckInCountsQuery.data.thisMachine.toLocaleString()}
                    </span>
                  </LabelledText>
                </Row>
              )}
              {isAbsenteeMode && <AbsenteeModeCallout />}
            </Row>
          </Row>
        </MainHeader>
        <MainContent>
          <VoterSearch
            search={search}
            setSearch={setSearch}
            renderAction={(voter) =>
              voter.checkIn ? (
                <CheckInDetails checkIn={voter.checkIn} />
              ) : (
                <Button
                  style={{ flexWrap: 'nowrap' }}
                  rightIcon="Next"
                  color="primary"
                  data-testid={`check-in-button#${voter.voterId}`}
                  onPress={() => onSelect(voter.voterId)}
                >
                  <Font noWrap>Start Check-In</Font>
                </Button>
              )
            }
          />
        </MainContent>
      </Main>
    </PollWorkerNavScreen>
  );
}
