import { useCallback, useState } from 'react';
import {
  assert,
  assertDefined,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import type {
  PartyAbbreviation,
  VoterCheckInError,
  VoterIdentificationMethod,
  VoterSearchParams,
} from '@votingworks/pollbook-backend';
import {
  Button,
  ButtonBar,
  FullScreenIconWrapper,
  FullScreenMessage,
  H1,
  Icons,
  MainHeader,
  P,
} from '@votingworks/ui';
import { Redirect, Route, Switch } from 'react-router-dom';
import {
  createEmptySearchParams,
  VoterSearchScreen,
} from './voter_search_screen';
import { VoterConfirmScreen } from './voter_confirm_screen';
import { NavScreen, NoNavScreen, pollWorkerRoutes } from './nav_screen';
import { Column, Row } from './layout';
import {
  getDeviceStatuses,
  getIsAbsenteeMode,
  getVoter,
  getPollbookConfigurationInformation,
  getElection,
  checkInVoter,
} from './api';
import { AbsenteeModeCallout, VoterName } from './shared_components';
import { AUTOMATIC_FLOW_STATE_RESET_DELAY_MS } from './globals';
import { SelectPartyScreen } from './select_party_screen';

type CheckInFlowState =
  | { step: 'search'; search: VoterSearchParams }
  | { step: 'confirm_identity'; voterId: string; search: VoterSearchParams }
  | {
      step: 'select_party';
      voterId: string;
      identificationMethod: VoterIdentificationMethod;
      search: VoterSearchParams;
    }
  | { step: 'printing' }
  | { step: 'success'; voterId: string }
  | { step: 'error'; errorType: VoterCheckInError };

export function VoterCheckInSuccessScreen({
  voterId,
  isAbsenteeMode,
  onClose,
}: {
  voterId: string;
  isAbsenteeMode: boolean;
  onClose: () => void;
}): JSX.Element | null {
  const getVoterQuery = getVoter.useQuery(voterId);
  if (!getVoterQuery.isSuccess) {
    return null;
  }

  const voter = getVoterQuery.data;

  return (
    <NoNavScreen>
      <MainHeader>
        <Row style={{ justifyContent: 'space-between' }}>
          <H1>Voter Checked In</H1>
          {isAbsenteeMode && <AbsenteeModeCallout />}
        </Row>
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
            <VoterName voter={voter} /> is checked in
          </H1>
          {!isAbsenteeMode && <p>Give the voter their receipt.</p>}
        </FullScreenMessage>
      </Column>
      <ButtonBar>
        <Button icon="X" onPress={onClose}>
          Close
        </Button>
      </ButtonBar>
    </NoNavScreen>
  );
}

export function VoterCheckInScreen(): JSX.Element | null {
  const [flowState, setFlowState] = useState<CheckInFlowState>({
    step: 'search',
    search: createEmptySearchParams(false),
  });
  const [timeoutIdForFlowStateReset, setTimeoutIdForFlowStateReset] =
    useState<ReturnType<typeof setTimeout>>();
  const checkInVoterMutation = checkInVoter.useMutation();
  const checkInVoterMutate = checkInVoterMutation.mutate;
  const getIsAbsenteeModeQuery = getIsAbsenteeMode.useQuery();
  const getElectionQuery = getElection.useQuery();
  const getPollbookConfigurationInformationQuery =
    getPollbookConfigurationInformation.useQuery();

  const resetFlowState = useCallback(() => {
    clearTimeout(timeoutIdForFlowStateReset);
    setFlowState({
      step: 'search',
      search: createEmptySearchParams(false),
    });
  }, [timeoutIdForFlowStateReset]);

  const setSearch = useCallback((search: VoterSearchParams) => {
    setFlowState({ step: 'search', search });
  }, []);

  const setConfirmIdentity = useCallback(
    (voterId: string) => {
      if (flowState.step !== 'search' && flowState.step !== 'select_party') {
        /* istanbul ignore next - @preserve */
        return;
      }

      setFlowState({
        step: 'confirm_identity',
        voterId,
        search: flowState.search,
      });
    },
    [flowState]
  );

  const onCancel = useCallback(() => {
    let search = createEmptySearchParams(false);
    if (
      flowState.step === 'confirm_identity' ||
      flowState.step === 'select_party'
    ) {
      // Preserve the values in the search inputs
      search = { ...flowState.search };
    }

    setFlowState({
      step: 'search',
      search,
    });
  }, [flowState]);

  const onConfirmCheckIn = useCallback(
    (
      voterId: string,
      identificationMethod: VoterIdentificationMethod,
      ballotParty: PartyAbbreviation
    ) => {
      setFlowState({ step: 'printing' });
      checkInVoterMutate(
        {
          voterId,
          identificationMethod,
          ballotParty,
        },
        {
          onSuccess: (result: Result<void, VoterCheckInError>) => {
            assert(
              flowState.step === 'confirm_identity' ||
                flowState.step === 'select_party'
            );
            if (result.isOk()) {
              setFlowState({
                step: 'success',
                voterId: flowState.voterId,
              });
              setTimeoutIdForFlowStateReset(
                setTimeout(resetFlowState, AUTOMATIC_FLOW_STATE_RESET_DELAY_MS)
              );
            } else {
              setFlowState({ step: 'error', errorType: result.err() });
            }
          },
        }
      );
    },
    [checkInVoterMutate, flowState, resetFlowState]
  );

  if (
    !getIsAbsenteeModeQuery.isSuccess ||
    !getElectionQuery.isSuccess ||
    !getPollbookConfigurationInformationQuery.isSuccess
  ) {
    return null;
  }

  const isAbsenteeMode = getIsAbsenteeModeQuery.data;
  const election = assertDefined(getElectionQuery.data.unsafeUnwrap());
  const configuredPrecinctId = assertDefined(
    getPollbookConfigurationInformationQuery.data.configuredPrecinctId
  );

  switch (flowState.step) {
    case 'search':
      return (
        <VoterSearchScreen
          search={flowState.search}
          setSearch={setSearch}
          isAbsenteeMode={isAbsenteeMode}
          onSelect={setConfirmIdentity}
          election={election}
          configuredPrecinctId={configuredPrecinctId}
        />
      );

    // Check-in can be confirmed at this step unless
    //   (1) election is a primary and
    //   (2) the voter's party is undeclared
    case 'confirm_identity':
      return (
        <VoterConfirmScreen
          voterId={flowState.voterId}
          isAbsenteeMode={isAbsenteeMode}
          configuredPrecinctId={configuredPrecinctId}
          election={election}
          onCancel={onCancel}
          // Called when party must be selected in next step before check-in is completed
          onConfirmVoterIdentity={(
            voterId: string,
            identificationMethod: VoterIdentificationMethod
          ) => {
            setFlowState({
              step: 'select_party',
              voterId,
              identificationMethod,
              search: flowState.search,
            });
          }}
          // Called when check-in can be completed in this step
          onConfirmCheckIn={onConfirmCheckIn}
        />
      );

    // Step displayed only when
    //   (1) election is a primary and
    //   (2) the voter's party is undeclared
    case 'select_party':
      return (
        <SelectPartyScreen
          voterId={flowState.voterId}
          identificationMethod={flowState.identificationMethod}
          onConfirmCheckIn={onConfirmCheckIn}
          onBack={() => setConfirmIdentity(flowState.voterId)}
        />
      );

    case 'printing':
      return (
        <NoNavScreen>
          <MainHeader>
            <Row style={{ justifyContent: 'space-between' }}>
              <H1>Check In Voter</H1>
              {isAbsenteeMode && <AbsenteeModeCallout />}
            </Row>
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
        <VoterCheckInSuccessScreen
          voterId={flowState.voterId}
          isAbsenteeMode={isAbsenteeMode}
          onClose={resetFlowState}
        />
      );

    case 'error': {
      let errorMessage = '';
      switch (flowState.errorType) {
        case 'already_checked_in':
          errorMessage = 'Voter Already Checked In';
          break;
        case 'mismatched_party_selection':
          errorMessage =
            "Voter's Declared Party Differs From Ballot Party Selection";
          break;
        case 'undeclared_voter_missing_ballot_party':
          errorMessage = 'Undeclared Primary Voters Must Choose a Party Ballot';
          break;
        case 'unknown_voter_party':
          errorMessage = 'Voter Has No Declared Party';
          break;
        default:
          /* istanbul ignore next - @preserve */
          throwIllegalValue(flowState.errorType);
      }
      return (
        <NoNavScreen>
          <MainHeader>
            <Row style={{ justifyContent: 'space-between' }}>
              <H1>Check In Voter</H1>
              {isAbsenteeMode && <AbsenteeModeCallout />}
            </Row>
          </MainHeader>
          <Column style={{ justifyContent: 'center', flex: 1 }}>
            <FullScreenMessage
              title={errorMessage}
              image={
                <FullScreenIconWrapper>
                  <Icons.Danger color="danger" />
                </FullScreenIconWrapper>
              }
            />
          </Column>
          <ButtonBar>
            <Button onPress={resetFlowState}>Close</Button>
          </ButtonBar>
        </NoNavScreen>
      );
    }
    default:
      /* istanbul ignore next - @preserve */
      throwIllegalValue(flowState);
  }
}

export function PollWorkerScreen(): JSX.Element | null {
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();
  const getPollbookConfigurationInformationQuery =
    getPollbookConfigurationInformation.useQuery();

  if (
    !getDeviceStatusesQuery.isSuccess ||
    !getPollbookConfigurationInformationQuery.isSuccess
  ) {
    return null;
  }

  const { printer } = getDeviceStatusesQuery.data;

  const { configuredPrecinctId } =
    getPollbookConfigurationInformationQuery.data;
  if (!printer.connected) {
    return (
      <NavScreen>
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
      </NavScreen>
    );
  }

  if (!configuredPrecinctId) {
    return (
      <NavScreen>
        <Column>
          <FullScreenMessage
            title="No Precinct Selected"
            image={
              <FullScreenIconWrapper>
                <Icons.Disabled />
              </FullScreenIconWrapper>
            }
          >
            <P>Insert an election manager card to select a precinct.</P>
          </FullScreenMessage>
        </Column>
      </NavScreen>
    );
  }

  return (
    <Switch>
      <Route
        path={pollWorkerRoutes.checkIn.path}
        component={VoterCheckInScreen}
      />
      <Redirect to={pollWorkerRoutes.checkIn.path} />
    </Switch>
  );
}
