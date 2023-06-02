import { assert, find } from '@votingworks/basics';
import React, { useContext, useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';

import {
  Button,
  Table,
  TD,
  LinkButton,
  H1,
  P,
  H4,
  Select,
  Modal,
  Font,
} from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';
import {
  BallotStyle,
  Election,
  Precinct,
  SelectChangeEventFunction,
} from '@votingworks/types';
import type {
  ManualResultsVotingMethod,
  ManualResultsIdentifier,
} from '@votingworks/admin-backend';
import { routerPaths } from '../router_paths';

import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';
import { RemoveAllManualTalliesModal } from '../components/remove_all_manual_tallies_modal';
import { deleteManualResults, getManualResultsMetadata } from '../api';
import { Loading } from '../components/loading';

const allManualTallyBallotTypes: ManualResultsVotingMethod[] = ['precinct'];

function getAllPossibleManualTallyIdentifiers(
  election: Election
): ManualResultsIdentifier[] {
  return election.ballotStyles.flatMap((bs) =>
    bs.precincts.flatMap((precinctId) => [
      {
        ballotStyleId: bs.id,
        precinctId,
        votingMethod: 'precinct',
      },
    ])
  );
}

const SummaryTableWrapper = styled.div`
  table {
    width: 60%;
  }

  tfoot td {
    border-bottom: unset;
    padding-top: 0.5rem;
  }
`;

function RemoveManualTallyModal({
  identifier,
  election,
  onClose,
}: {
  identifier: ManualResultsIdentifier;
  election: Election;
  onClose: VoidFunction;
}): JSX.Element {
  const deleteManualTallyMutation = deleteManualResults.useMutation();

  function onConfirm() {
    deleteManualTallyMutation.mutate({
      ballotStyleId: identifier.ballotStyleId,
      precinctId: identifier.precinctId,
      votingMethod: identifier.votingMethod,
    });
    onClose();
  }
  const precinct = find(
    election.precincts,
    (p) => p.id === identifier.precinctId
  );
  const votingMethodTitle =
    identifier.votingMethod === 'absentee' ? 'Absentee' : 'Precinct';

  return (
    <Modal
      content={
        <React.Fragment>
          <H1>Remove Manually Entered Results</H1>
          <P>
            Do you want to remove the manually entered results for the following
            type of ballots cast?
          </P>
          <P>
            <Font weight="bold">Ballot Style:</Font> {identifier.ballotStyleId}
            <br />
            <Font weight="bold">Precinct:</Font> {precinct.name}
            <br />
            <Font weight="bold">Voting Method:</Font> {votingMethodTitle}
          </P>
        </React.Fragment>
      }
      actions={
        <React.Fragment>
          <Button variant="danger" onPress={onConfirm}>
            Remove Manually Entered Results
          </Button>
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
    />
  );
}

export function ManualDataSummaryScreen(): JSX.Element {
  const { electionDefinition, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for adding manual tally data
  const { election } = electionDefinition;
  const history = useHistory();

  const getManualTallyMetadataQuery = getManualResultsMetadata.useQuery();

  const manualTallyMetadataRecords = useMemo(() => {
    if (!getManualTallyMetadataQuery.data) return [];

    return [...getManualTallyMetadataQuery.data].sort(
      (metadataA, metadataB) => {
        return (
          metadataA.ballotStyleId.localeCompare(metadataB.ballotStyleId) ||
          metadataA.precinctId.localeCompare(metadataB.precinctId) ||
          metadataA.votingMethod.localeCompare(metadataB.votingMethod)
        );
      }
    );
  }, [getManualTallyMetadataQuery.data]);
  const hasManualTally = manualTallyMetadataRecords.length > 0;
  const totalNumberBallotsEntered = manualTallyMetadataRecords
    .map(({ ballotCount }) => ballotCount)
    .reduce((total, current) => total + current, 0);

  const [isClearingAll, setIsClearingAll] = useState(false);

  const [manualTallyToRemove, setManualTallyToRemove] =
    useState<ManualResultsIdentifier>();

  // metadata for tallies which do not exist yet and thus could be added
  const uncreatedManualTallyMetadata = useMemo(() => {
    return getAllPossibleManualTallyIdentifiers(election).filter(
      (identifier) =>
        !manualTallyMetadataRecords.some(
          ({ ballotStyleId, precinctId, votingMethod }) =>
            ballotStyleId === identifier.ballotStyleId &&
            precinctId === identifier.precinctId &&
            votingMethod === identifier.votingMethod
        )
    );
  }, [election, manualTallyMetadataRecords]);

  const [selectedPrecinct, setSelectedPrecinct] = useState<Precinct>();
  const [selectedBallotStyle, setSelectedBallotStyle] = useState<BallotStyle>();
  const [selectedVotingMethod, setSelectedBallotType] =
    useState<ManualResultsVotingMethod>();

  const selectableBallotStyles = election.ballotStyles.filter((bs) => {
    return uncreatedManualTallyMetadata.some(
      (metadata) => metadata.ballotStyleId === bs.id
    );
  });
  const selectablePrecincts = selectedBallotStyle
    ? election.precincts.filter((precinct) => {
        return uncreatedManualTallyMetadata.some(
          (metadata) =>
            metadata.ballotStyleId === selectedBallotStyle.id &&
            metadata.precinctId === precinct.id
        );
      })
    : [];
  const selectableBallotTypes: ManualResultsVotingMethod[] =
    selectedBallotStyle && selectedPrecinct
      ? allManualTallyBallotTypes.filter((votingMethod) => {
          return uncreatedManualTallyMetadata.some(
            (metadata) =>
              metadata.ballotStyleId === selectedBallotStyle.id &&
              metadata.precinctId === selectedPrecinct.id &&
              metadata.votingMethod === votingMethod
          );
        })
      : [];

  const handleBallotStyleSelect: SelectChangeEventFunction = (event) => {
    const { value } = event.currentTarget;

    setSelectedBallotStyle(
      find(election.ballotStyles, (bs) => bs.id === value)
    );
    setSelectedPrecinct(undefined);
    setSelectedBallotType(undefined);
  };
  const handlePrecinctSelect: SelectChangeEventFunction = (event) => {
    const { value } = event.currentTarget;

    setSelectedPrecinct(find(election.precincts, (p) => p.id === value));
    setSelectedBallotType(undefined);
  };
  const handleBallotTypeSelect: SelectChangeEventFunction = (event) => {
    const { value } = event.currentTarget;

    setSelectedBallotType(value as ManualResultsVotingMethod);
  };

  if (!getManualTallyMetadataQuery.isSuccess) {
    return (
      <NavigationScreen title="Manually Entered Results">
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  return (
    <React.Fragment>
      <NavigationScreen title="Manually Entered Results Summary">
        <P>
          <Button onPress={() => history.push(routerPaths.tally)}>
            Back to Tally
          </Button>
        </P>
        <H4>Total Manual Ballot Count: {totalNumberBallotsEntered}</H4>
        <br />
        <SummaryTableWrapper>
          <Table condensed data-testid="summary-data">
            <thead>
              <tr>
                <TD as="th" narrow nowrap>
                  Ballot Style
                </TD>
                <TD as="th" narrow nowrap>
                  Precinct
                </TD>
                <TD as="th" narrow nowrap>
                  Voting Method
                </TD>
                <TD as="th" />
                <TD as="th" />
                <TD as="th" narrow nowrap>
                  Ballot Count
                </TD>
              </tr>
            </thead>
            <tbody>
              {manualTallyMetadataRecords.map((metadata) => {
                const precinct = find(
                  election.precincts,
                  (p) => p.id === metadata.precinctId
                );
                const votingMethodTitle =
                  metadata.votingMethod === 'absentee'
                    ? 'Absentee'
                    : 'Precinct';
                return (
                  <tr
                    key={`${metadata.precinctId}-${metadata.ballotStyleId}-${metadata.votingMethod}`}
                  >
                    <TD>{metadata.ballotStyleId}</TD>
                    <TD>{precinct.name}</TD>

                    <TD>{votingMethodTitle}</TD>
                    <TD nowrap>
                      <LinkButton
                        small
                        to={routerPaths.manualDataEntry(metadata)}
                      >
                        Edit Results
                      </LinkButton>
                    </TD>
                    <TD nowrap>
                      <Button
                        small
                        onPress={() => setManualTallyToRemove(metadata)}
                      >
                        Remove Results
                      </Button>
                    </TD>
                    <TD nowrap textAlign="center" data-testid="numBallots">
                      {metadata.ballotCount}
                    </TD>
                  </tr>
                );
              })}
            </tbody>
            {uncreatedManualTallyMetadata.length > 0 && (
              <tfoot>
                <tr>
                  <TD>
                    <Select
                      id="selectBallotStyle"
                      data-testid="selectBallotStyle"
                      value={selectedBallotStyle?.id || ''}
                      onBlur={handleBallotStyleSelect}
                      onChange={handleBallotStyleSelect}
                      small
                    >
                      <option value="" disabled>
                        Select Ballot Style...{' '}
                      </option>
                      {selectableBallotStyles.map((bs) => (
                        <option key={bs.id} value={bs.id}>
                          {bs.id}
                        </option>
                      ))}
                    </Select>
                  </TD>
                  <TD>
                    <Select
                      id="selectPrecinct"
                      data-testid="selectPrecinct"
                      value={selectedPrecinct?.id || ''}
                      onBlur={handlePrecinctSelect}
                      onChange={handlePrecinctSelect}
                      small
                      disabled={!selectedBallotStyle}
                    >
                      <option value="" disabled>
                        Select Precinct...{' '}
                      </option>
                      {selectablePrecincts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </TD>
                  <TD>
                    <Select
                      id="selectBallotType"
                      data-testid="selectBallotType"
                      value={selectedVotingMethod || ''}
                      onBlur={handleBallotTypeSelect}
                      onChange={handleBallotTypeSelect}
                      small
                      disabled={!selectedPrecinct}
                    >
                      <option value="" disabled>
                        Select Voting Method...{' '}
                      </option>
                      {selectableBallotTypes.map((bt) => (
                        <option key={bt} value={bt}>
                          {bt === 'absentee' ? 'Absentee' : 'Precinct'}
                        </option>
                      ))}
                    </Select>
                  </TD>
                  <TD nowrap>
                    {selectedBallotStyle &&
                    selectedPrecinct &&
                    selectedVotingMethod ? (
                      <LinkButton
                        small
                        variant="primary"
                        to={routerPaths.manualDataEntry({
                          ballotStyleId: selectedBallotStyle.id,
                          precinctId: selectedPrecinct.id,
                          votingMethod: selectedVotingMethod,
                        })}
                      >
                        Add Results
                      </LinkButton>
                    ) : (
                      <LinkButton small disabled>
                        Add Results
                      </LinkButton>
                    )}
                  </TD>
                  <TD />
                  <TD textAlign="center">-</TD>
                </tr>
              </tfoot>
            )}
          </Table>
        </SummaryTableWrapper>
        <br />
        <P>
          <Button
            variant="danger"
            disabled={!hasManualTally}
            onPress={() => setIsClearingAll(true)}
          >
            Remove All Manually Entered Results
          </Button>
        </P>
      </NavigationScreen>
      {isClearingAll && (
        <RemoveAllManualTalliesModal onClose={() => setIsClearingAll(false)} />
      )}
      {manualTallyToRemove && (
        <RemoveManualTallyModal
          identifier={manualTallyToRemove}
          election={election}
          onClose={() => setManualTallyToRemove(undefined)}
        />
      )}
    </React.Fragment>
  );
}
