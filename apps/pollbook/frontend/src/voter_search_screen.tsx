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
  Modal,
} from '@votingworks/ui';
import debounce from 'lodash.debounce';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type {
  AamvaDocument,
  VoterSearchParams,
} from '@votingworks/pollbook-backend';
import styled from 'styled-components';
import { format } from '@votingworks/utils';
import { Optional } from '@votingworks/basics';
import {
  Election,
  Voter,
  VoterCheckIn,
  VoterIdentificationMethod,
} from '@votingworks/types';
import { useQueryClient } from '@tanstack/react-query';
import { usJurisdictions } from './us_states';
import { Column, Form, Row, InputGroup } from './layout';
import { NavScreen } from './nav_screen';
import { getCheckInCounts, getScannedIdDocument, searchVoters } from './api';
import {
  AbsenteeModeCallout,
  AddressChange,
  PartyName,
  PrecinctName,
  VoterAddress,
  VoterName,
} from './shared_components';
import { getVoterPrecinct } from './types';

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

function formatNameSearch(search: VoterSearchParams): string {
  return [
    `${search.lastName},`,
    search.firstName,
    search.middleName,
    search.suffix,
  ]
    .filter((part) => !!part)
    .join(' ');
}

export function validateUsState(aamvaIssuingJurisdiction: string): string {
  if (Object.keys(usJurisdictions).includes(aamvaIssuingJurisdiction)) {
    return aamvaIssuingJurisdiction;
  }

  // TODO add a default
  /* istanbul ignore next - @preserve */
  throw new Error(`Unhandled ID jurisdiction: ${aamvaIssuingJurisdiction}`);
}

export function createEmptySearchParams({
  strictMatch,
  ignoreSuffix,
}: {
  strictMatch: boolean;
  ignoreSuffix?: boolean;
}): VoterSearchParams {
  return {
    lastName: '',
    middleName: '',
    firstName: '',
    suffix: '',
    strictMatch,
    ignoreSuffix: ignoreSuffix || false,
  };
}

function documentMatchesParams(
  document: AamvaDocument,
  searchParams: VoterSearchParams
) {
  return (
    document.firstName === searchParams.firstName &&
    document.middleName === searchParams.middleName &&
    document.lastName === searchParams.lastName &&
    document.nameSuffix === searchParams.suffix
  );
}

export function VoterSearch({
  search,
  setSearch,
  // Function to call when exactly one voter is matched by scanning an ID
  onBarcodeScanMatch,
  renderAction,
  election,
  hideInvalidatedRegistrations = false,
}: {
  search: VoterSearchParams;
  setSearch: (search: VoterSearchParams) => void;
  onBarcodeScanMatch: (
    voter: Voter,
    identificationMethod: VoterIdentificationMethod
  ) => void;
  renderAction: (voter: Voter) => React.ReactNode;
  election: Election;
  hideInvalidatedRegistrations?: boolean;
}): JSX.Element {
  const queryClient = useQueryClient();
  const [voterSearchParams, setVoterSearchParams] =
    useState<VoterSearchParams>(search);
  const [displayUnknownScanError, setDisplayUnknownScanError] = useState(false);
  const updateDebouncedSearch = useMemo(
    () => debounce(setVoterSearchParams, 500),
    []
  );
  function updateManuallyEnteredSearch(newSearch: Partial<VoterSearchParams>) {
    const merged: VoterSearchParams = {
      ...search,
      ...newSearch,
      strictMatch: false,
    };
    setSearch(merged);
    updateDebouncedSearch(merged);
  }

  const searchVotersQuery = searchVoters.useQuery(voterSearchParams);
  const getScannedIdDocumentQuery = getScannedIdDocument.useQuery();

  const barcodeScannerResponse = getScannedIdDocumentQuery.data;

  let scannedIdDocument: Optional<AamvaDocument>;
  let barcodeScannerError: Optional<Error>;
  if (barcodeScannerResponse) {
    scannedIdDocument = barcodeScannerResponse.ok();
    barcodeScannerError = barcodeScannerResponse.err();
  }

  const onEditSearch = useCallback(() => {
    const merged: VoterSearchParams = {
      firstName:
        voterSearchParams.firstName ||
        /* istanbul ignore next - @preserve - voterSearchParams.firstName being falsy is extremely unlikely */
        '',
      middleName: '',
      lastName:
        voterSearchParams.lastName ||
        /* istanbul ignore next - @preserve - voterSearchParams.lastName being falsy is extremely unlikely */
        '',
      suffix: '',
      strictMatch: false,
      ignoreSuffix: false, // There's no manual suffix input so this field is irrelevant for now
    };
    setSearch(merged);
    setVoterSearchParams(merged);
  }, [voterSearchParams, setSearch]);

  const hiddenSearchParamsExist =
    voterSearchParams.middleName ||
    voterSearchParams.suffix ||
    voterSearchParams.strictMatch ||
    voterSearchParams.ignoreSuffix;

  useEffect(() => {
    if (barcodeScannerError?.message === 'unknown_document_type') {
      setDisplayUnknownScanError(true);
    }
  }, [barcodeScannerError]);

  // Update the search input and query if we got a scanned document
  useEffect(() => {
    if (scannedIdDocument) {
      const merged: VoterSearchParams = {
        firstName: scannedIdDocument.firstName,
        middleName: scannedIdDocument.middleName,
        lastName: scannedIdDocument.lastName,
        suffix: scannedIdDocument.nameSuffix,
        strictMatch: true,
        ignoreSuffix: true,
      };
      setDisplayUnknownScanError(false);
      setSearch(merged);
      setVoterSearchParams(merged);
    }
  }, [scannedIdDocument, setSearch]);

  useEffect(() => {
    if (
      scannedIdDocument &&
      // We don't want to handle navigation after `scannedIdDocument` updates
      // but before `voterSearchParams` updates. The latter will be stale
      // and we'd navigate using the wrong data.
      documentMatchesParams(scannedIdDocument, voterSearchParams) &&
      searchVotersQuery.isSuccess &&
      searchVotersQuery.data &&
      voterSearchParams.strictMatch
    ) {
      const searchResult = searchVotersQuery.data;

      // If we don't invalidate the query for scanned ID then this effect will fire
      // immediately after the user navigates back to this component even though the
      // scanned data has been consumed in the backend.
      // This is because the query holds the stale data. Explicit query invalidation
      // seems to be more reliable than setting `staleTime` on the query.
      void queryClient.invalidateQueries({
        queryKey: ['getScannedIdDocument'],
        refetchType: 'all',
      });

      const identificationMethod: VoterIdentificationMethod =
        scannedIdDocument.issuingJurisdiction === 'NH'
          ? { type: 'default' }
          : {
              type: 'outOfStateLicense',
              state: validateUsState(scannedIdDocument.issuingJurisdiction),
            };

      if (typeof searchResult === 'object' && searchResult.length === 1) {
        onBarcodeScanMatch({ ...searchResult[0] }, identificationMethod);
      }
    }
  }, [
    queryClient,
    voterSearchParams,
    searchVotersQuery.isSuccess,
    searchVotersQuery.data,
    scannedIdDocument,
    onBarcodeScanMatch,
  ]);

  return (
    <Column style={{ gap: '1rem', height: '100%' }}>
      {hiddenSearchParamsExist ? (
        <Row style={{ gap: '5rem' }}>
          <Column style={{ flexGrow: 2 }}>
            <Form>
              <InputGroup label="Scanned ID">
                <input
                  value={formatNameSearch(search)}
                  data-testid="scanned-id-input"
                  style={{ flexGrow: 1 }}
                  disabled
                  onChange={
                    /* istanbul ignore next */
                    () => {}
                  }
                  type="text"
                />
              </InputGroup>
            </Form>
          </Column>
          <Column style={{ marginTop: '1.5rem' }}>
            <Button
              style={{ justifySelf: 'end' }}
              onPress={onEditSearch}
              variant="primary"
            >
              Edit Search
            </Button>
          </Column>
        </Row>
      ) : (
        <Form>
          <Row style={{ gap: '1rem' }}>
            <InputGroup label="Last Name">
              <input
                value={search.lastName}
                data-testid="last-name-input"
                onChange={(e) =>
                  updateManuallyEnteredSearch({
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
                  updateManuallyEnteredSearch({
                    firstName: e.target.value.toUpperCase(),
                  })
                }
                type="text"
              />
            </InputGroup>
          </Row>
        </Form>
      )}
      {displayUnknownScanError && (
        <Modal
          title="ID Not Recognized"
          content={
            <div>
              Unable to read the scanned barcode. Please try scanning again or
              enter the name manually.
            </div>
          }
          actions={
            <Button
              onPress={() => setDisplayUnknownScanError(false)}
              variant="primary"
            >
              Close
            </Button>
          }
        />
      )}
      {searchVotersQuery.data &&
        (typeof searchVotersQuery.data === 'number' ? (
          <Callout icon="Info" color="neutral">
            <div>
              Voters matched: {searchVotersQuery.data}. Refine your search
              further to view results.
            </div>
          </Callout>
        ) : (
          (() => {
            const filteredVoters = hideInvalidatedRegistrations
              ? searchVotersQuery.data.filter(
                  (v) => !v.isInvalidatedRegistration
                )
              : searchVotersQuery.data;
            return filteredVoters.length === 0 ? (
              <Callout icon="Info" color="neutral">
                No voters matched.
              </Callout>
            ) : (
              <React.Fragment>
                <div>Voters matched: {filteredVoters.length}</div>
                <VoterTableWrapper>
                  <VoterTable>
                    <tbody>
                      {filteredVoters.map((voter) => {
                        const inactiveStyle =
                          voter.isInactive || voter.isInvalidatedRegistration;
                        const invalidatedStyle = inactiveStyle
                          ? {
                              opacity: 0.5,
                              textDecoration: 'line-through' as const,
                            }
                          : {};
                        return (
                          <tr
                            key={voter.voterId}
                            data-testid={`voter-row#${voter.voterId}`}
                          >
                            <td style={inactiveStyle ? { opacity: 0.5 } : {}}>
                              {voter.isInvalidatedRegistration && (
                                <Caption>
                                  <Icons.Delete /> Invalid Registration
                                </Caption>
                              )}
                              {voter.isInactive && (
                                <Caption>
                                  <Icons.Delete /> Inactive Voter
                                </Caption>
                              )}
                              {voter.nameChange && (
                                <Caption>Updated Name</Caption>
                              )}
                              <H2 style={{ margin: 0, ...invalidatedStyle }}>
                                <VoterName voter={voter} lastNameFirst />
                              </H2>
                              <span style={invalidatedStyle}>
                                <PartyName party={voter.party} />
                                {election.precincts.length > 1 && (
                                  <span>
                                    {' • '}
                                    <PrecinctName
                                      precinctId={getVoterPrecinct(voter)}
                                      election={election}
                                    />
                                  </span>
                                )}
                              </span>
                            </td>
                            <td style={inactiveStyle ? { opacity: 0.5 } : {}}>
                              {voter.addressChange ? (
                                <LabelledText label="Updated Address">
                                  <AddressChange
                                    address={voter.addressChange}
                                  />
                                </LabelledText>
                              ) : (
                                <VoterAddress voter={voter} />
                              )}
                            </td>
                            <td style={{ width: '1%' }}>
                              {renderAction(voter)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </VoterTable>
                </VoterTableWrapper>
              </React.Fragment>
            );
          })()
        ))}
    </Column>
  );
}

export function CheckInDetails({
  checkIn,
}: {
  checkIn: VoterCheckIn;
}): JSX.Element {
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
      </Caption>
    </Column>
  );
}

export function VoterSearchScreen({
  search,
  setSearch,
  isAbsenteeMode,
  onSelect,
  election,
  configuredPrecinctId,
}: {
  search: VoterSearchParams;
  setSearch: (search: VoterSearchParams) => void;
  isAbsenteeMode: boolean;
  onSelect: (
    voterId: string,
    identificationMethod: VoterIdentificationMethod
  ) => void;
  election: Election;
  configuredPrecinctId?: string;
}): JSX.Element | null {
  const getCheckInCountsQuery = getCheckInCounts.useQuery();

  const onBarcodeScanMatch = useCallback(
    (voter: Voter, identificationMethod: VoterIdentificationMethod) => {
      if (!voter.checkIn) {
        onSelect(voter.voterId, identificationMethod);
      }
    },
    [onSelect]
  );

  return (
    <NavScreen>
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
                  <LabelledText label="Total Check-Ins">
                    <span data-testid="total-check-ins">
                      {getCheckInCountsQuery.data.allMachines.toLocaleString()}
                    </span>
                  </LabelledText>
                  <LabelledText label="Machine Check-Ins">
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
            onBarcodeScanMatch={onBarcodeScanMatch}
            election={election}
            hideInvalidatedRegistrations
            renderAction={(voter) =>
              voter.checkIn ? (
                <CheckInDetails checkIn={voter.checkIn} />
              ) : (
                <Button
                  style={{ flexWrap: 'nowrap' }}
                  rightIcon="Next"
                  color="primary"
                  data-testid={`check-in-button#${voter.voterId}`}
                  onPress={() => onSelect(voter.voterId, { type: 'default' })}
                >
                  <Font noWrap>
                    {configuredPrecinctId &&
                    configuredPrecinctId === getVoterPrecinct(voter)
                      ? 'Start Check-In'
                      : 'View Details'}
                  </Font>
                </Button>
              )
            }
          />
        </MainContent>
      </Main>
    </NavScreen>
  );
}
