import type {
  DuplicateVoterError,
  PartyAbbreviation,
  Voter,
  VoterRegistrationRequest,
} from '@votingworks/pollbook-backend';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Button,
  ButtonBar,
  Callout,
  FullScreenIconWrapper,
  FullScreenMessage,
  H1,
  Icons,
  MainContent,
  MainHeader,
  Modal,
  SearchSelect,
} from '@votingworks/ui';
import { throwIllegalValue, assert } from '@votingworks/basics';
import {
  getDeviceStatuses,
  getPollbookConfigurationInformation,
  registerVoter,
} from './api';
import { AUTOMATIC_FLOW_STATE_RESET_DELAY_MS } from './globals';
import { ElectionManagerNavScreen, NoNavScreen } from './nav_screen';
import { Column, FieldName, Row } from './layout';
import { RequiredStaticInput, VoterName } from './shared_components';
import { AddressInputGroup } from './address_input_group';
import { NameInputGroup } from './name_input_group';

function createBlankVoter(): VoterRegistrationRequest {
  return {
    firstName: '',
    lastName: '',
    middleName: '',
    suffix: '',
    party: '',
    streetNumber: '',
    streetName: '',
    streetSuffix: '',
    houseFractionNumber: '',
    apartmentUnitNumber: '',
    addressLine2: '',
    addressLine3: '',
    city: '',
    state: 'NH',
    zipCode: '',
    precinct: '',
  };
}

function RegistrationDuplicateNameMessage({
  inputtedVoter,
  duplicateError,
}: {
  inputtedVoter: VoterRegistrationRequest;
  duplicateError: DuplicateVoterError;
}): JSX.Element | null {
  const inputtedNameParts: string[] = [
    inputtedVoter.firstName,
    inputtedVoter.middleName,
    inputtedVoter.lastName,
    inputtedVoter.suffix,
  ];
  const inputtedName = inputtedNameParts.filter(Boolean).join(' ');
  if (duplicateError.matchingVoters.length > 1) {
    return (
      <span>
        There are already {duplicateError.matchingVoters.length} voters with the
        name {inputtedName}. Please check the list of voters to confirm that the
        new voter registration is not a duplicate.
      </span>
    );
  }
  assert(duplicateError.matchingVoters.length === 1);
  const voter = duplicateError.matchingVoters[0];
  return (
    <span>
      There is already a voter with the name {inputtedName}. The existing voter
      has the voter ID {voter.voterId}. Please confirm that the new voter
      registration is not a duplicate.
    </span>
  );
}

type RegistrationFlowState =
  | { step: 'register' }
  | { step: 'has-name-match'; duplicateError: DuplicateVoterError }
  | { step: 'printing'; registrationData: VoterRegistrationRequest }
  | { step: 'success'; voter: Voter };

export function VoterRegistrationScreen(): JSX.Element | null {
  const registerVoterMutation = registerVoter.useMutation();
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();
  const getPollbookConfigurationInformationQuery =
    getPollbookConfigurationInformation.useQuery();
  const [flowState, setFlowState] = useState<RegistrationFlowState>({
    step: 'register',
  });
  const [timeoutIdForFlowStateReset, setTimeoutIdForFlowStateReset] =
    useState<ReturnType<typeof setTimeout>>();
  const resetFlowState = useCallback(() => {
    clearTimeout(timeoutIdForFlowStateReset);
    setFlowState({ step: 'register' });
  }, [timeoutIdForFlowStateReset]);
  const [voter, setVoter] = useState<VoterRegistrationRequest>(
    createBlankVoter()
  );

  const isAddressValid = !(voter.city === '' || voter.zipCode === '');

  const isAddressInWrongPrecinct = useMemo(
    () =>
      isAddressValid &&
      getPollbookConfigurationInformationQuery.data !== undefined &&
      getPollbookConfigurationInformationQuery.data.configuredPrecinctId !==
        undefined &&
      voter.precinct !==
        getPollbookConfigurationInformationQuery.data.configuredPrecinctId,
    [
      isAddressValid,
      voter.precinct,
      getPollbookConfigurationInformationQuery.data,
    ]
  );

  const isSubmitDisabled = useMemo(
    () =>
      voter.firstName.trim() === '' ||
      voter.lastName.trim() === '' ||
      voter.streetName.trim() === '' ||
      voter.party.trim() === '' ||
      !isAddressValid ||
      isAddressInWrongPrecinct,
    [voter, isAddressValid, isAddressInWrongPrecinct]
  );

  if (
    !getDeviceStatusesQuery.isSuccess ||
    !getPollbookConfigurationInformationQuery.isSuccess
  ) {
    return null;
  }

  const { printer } = getDeviceStatusesQuery.data;
  if (!printer.connected) {
    return (
      <ElectionManagerNavScreen>
        <Column style={{ justifyContent: 'center', flex: 1 }}>
          <FullScreenMessage
            image={
              <FullScreenIconWrapper>
                <Icons.Danger />
              </FullScreenIconWrapper>
            }
            title="No Printer Detected"
          >
            <p>Connect printer to continue.</p>
          </FullScreenMessage>
        </Column>
      </ElectionManagerNavScreen>
    );
  }

  const { configuredPrecinctId } =
    getPollbookConfigurationInformationQuery.data;
  if (!configuredPrecinctId) {
    return (
      <ElectionManagerNavScreen>
        <Column>
          <FullScreenMessage
            title="No Precinct Selected"
            image={
              <FullScreenIconWrapper>
                <Icons.Disabled />
              </FullScreenIconWrapper>
            }
          />
        </Column>
      </ElectionManagerNavScreen>
    );
  }

  switch (flowState.step) {
    case 'register':
    case 'has-name-match':
      return (
        <ElectionManagerNavScreen title="Voter Registration">
          <MainContent>
            <Column style={{ gap: '1rem' }}>
              <NameInputGroup
                name={voter}
                onChange={(name) => setVoter({ ...voter, ...name })}
              />
              <AddressInputGroup
                address={voter}
                onChange={(address) => setVoter({ ...voter, ...address })}
              />
              <Row style={{ gap: '1rem' }}>
                <RequiredStaticInput>
                  <FieldName>Party Affiliation</FieldName>
                  <SearchSelect<PartyAbbreviation>
                    id="party"
                    aria-label="Party Affiliation"
                    style={{ width: '20rem' }}
                    value={voter.party || undefined}
                    onChange={(value) =>
                      setVoter({ ...voter, party: value || '' })
                    }
                    menuPortalTarget={document.body}
                    options={[
                      { value: 'REP', label: 'Republican' },
                      { value: 'DEM', label: 'Democrat' },
                      { value: 'UND', label: 'Undeclared' },
                    ]}
                  />
                </RequiredStaticInput>
              </Row>
              {voter.streetNumber.trim() !== '' &&
                voter.streetName !== '' &&
                !isAddressValid && (
                  <Callout icon="Danger" color="danger">
                    Invalid address. Make sure the street number and name match
                    a valid address for this jurisdiction.
                  </Callout>
                )}
              {isAddressInWrongPrecinct && (
                <Callout icon="Danger" color="danger">
                  This address is not in the current precinct. Voters can only
                  be registered to addresses within the configured precinct.
                </Callout>
              )}
            </Column>
          </MainContent>
          <ButtonBar>
            <Button
              icon="Add"
              variant="primary"
              data-testid="add-voter-btn"
              onPress={() => {
                setFlowState({ step: 'printing', registrationData: voter });
                registerVoterMutation.mutate(
                  { registrationData: voter, overrideNameMatchWarning: false },
                  {
                    onSuccess: (result) => {
                      if (result.isOk()) {
                        setFlowState({ step: 'success', voter: result.ok() });
                        setVoter(createBlankVoter());
                        setTimeoutIdForFlowStateReset(
                          setTimeout(
                            resetFlowState,
                            AUTOMATIC_FLOW_STATE_RESET_DELAY_MS
                          )
                        );
                      } else {
                        setFlowState({
                          step: 'has-name-match',
                          duplicateError: result.err(),
                        });
                      }
                    },
                  }
                );
              }}
              style={{ flex: 1 }}
              disabled={isSubmitDisabled}
            >
              Add Voter
            </Button>
            <div />
          </ButtonBar>
          {flowState.step === 'has-name-match' && (
            <Modal
              title="Duplicate Name Detected"
              content={
                <RegistrationDuplicateNameMessage
                  inputtedVoter={voter}
                  duplicateError={flowState.duplicateError}
                />
              }
              actions={
                <React.Fragment>
                  <Button
                    color="primary"
                    data-testid="confirm-duplicate-btn"
                    onPress={() => {
                      setFlowState({
                        step: 'printing',
                        registrationData: voter,
                      });
                      registerVoterMutation.mutate(
                        {
                          registrationData: voter,
                          overrideNameMatchWarning: true,
                        },
                        {
                          onSuccess: (result) => {
                            setFlowState({
                              step: 'success',
                              voter: result.unsafeUnwrap(),
                            });
                            setVoter(createBlankVoter());
                            setTimeoutIdForFlowStateReset(
                              setTimeout(
                                resetFlowState,
                                AUTOMATIC_FLOW_STATE_RESET_DELAY_MS
                              )
                            );
                          },
                        }
                      );
                    }}
                  >
                    Add Voter
                  </Button>
                  <Button onPress={() => setFlowState({ step: 'register' })}>
                    Close
                  </Button>
                </React.Fragment>
              }
            />
          )}
        </ElectionManagerNavScreen>
      );
    case 'printing':
      return (
        <NoNavScreen>
          <MainHeader>
            <H1>Voter Registration</H1>
          </MainHeader>
          <Column style={{ justifyContent: 'center', flex: 1 }}>
            <FullScreenMessage
              title="Printing voter receipt…"
              image={
                <FullScreenIconWrapper>
                  <Icons.Loading />
                </FullScreenIconWrapper>
              }
            />
          </Column>
        </NoNavScreen>
      );

    case 'success':
      return (
        <NoNavScreen>
          <MainHeader>
            <H1>Voter Added</H1>
          </MainHeader>
          <Column style={{ justifyContent: 'center', flex: 1 }}>
            <FullScreenMessage
              title={null}
              image={
                <FullScreenIconWrapper>
                  <Icons.Done color="primary" />
                </FullScreenIconWrapper>
              }
            >
              <H1>
                <VoterName voter={flowState.voter} /> has been added
              </H1>
              <p>Give the voter their receipt.</p>
            </FullScreenMessage>
          </Column>
          <ButtonBar>
            <Button icon="X" onPress={resetFlowState}>
              Close
            </Button>
          </ButtonBar>
        </NoNavScreen>
      );

    default:
      throwIllegalValue(flowState);
  }
}
