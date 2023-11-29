import { assert, find } from '@votingworks/basics';
import React, { useContext, useMemo, useState } from 'react';
import styled from 'styled-components';

import {
  Button,
  Table,
  TD,
  LinkButton,
  P,
  Modal,
  Font,
  SearchSelect,
  Card,
} from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';
import { BallotStyle, Election, Precinct } from '@votingworks/types';
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

export const TITLE = 'Manual Tallies';

export const ALL_MANUAL_TALLY_BALLOT_TYPES: ManualResultsVotingMethod[] = [
  'precinct',
  'absentee',
];

function getAllPossibleManualTallyIdentifiers(
  election: Election
): ManualResultsIdentifier[] {
  return election.ballotStyles.flatMap((bs) =>
    bs.precincts.flatMap((precinctId) =>
      ALL_MANUAL_TALLY_BALLOT_TYPES.flatMap((votingMethod) => [
        {
          ballotStyleId: bs.id,
          precinctId,
          votingMethod,
        },
      ])
    )
  );
}

const AddTalliesCard = styled(Card).attrs({ color: 'neutral' })`
  margin-bottom: 1rem;
`;

export const FieldName = styled.div`
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  margin-bottom: 0.5rem;
`;

const SummaryTableWrapper = styled.div`
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
      title="Remove Manual Tallies"
      content={
        <React.Fragment>
          <P>
            Do you want to remove the manual tallies for the following type of
            ballots cast?
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
          <Button icon="Delete" variant="danger" onPress={onConfirm}>
            Remove Manual Tallies
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
      ? ALL_MANUAL_TALLY_BALLOT_TYPES.filter((votingMethod) => {
          return uncreatedManualTallyMetadata.some(
            (metadata) =>
              metadata.ballotStyleId === selectedBallotStyle.id &&
              metadata.precinctId === selectedPrecinct.id &&
              metadata.votingMethod === votingMethod
          );
        })
      : [];

  function handleBallotStyleSelect(value?: string) {
    setSelectedBallotStyle(election.ballotStyles.find((bs) => bs.id === value));
    setSelectedPrecinct(undefined);
    setSelectedBallotType(undefined);
  }

  function handlePrecinctSelect(value?: string) {
    setSelectedPrecinct(election.precincts.find((p) => p.id === value));
    setSelectedBallotType(undefined);
  }

  function handleBallotTypeSelect(value?: string) {
    setSelectedBallotType(value as ManualResultsVotingMethod);
  }

  if (!getManualTallyMetadataQuery.isSuccess) {
    return (
      <NavigationScreen title={TITLE}>
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  return (
    <React.Fragment>
      <NavigationScreen
        title={TITLE}
        parentRoutes={[{ title: 'Tally', path: routerPaths.tally }]}
      >
        <P>
          <Font weight="semiBold">
            Total Manual Ballot Count:{' '}
            {totalNumberBallotsEntered.toLocaleString()}
          </Font>
        </P>
        {uncreatedManualTallyMetadata.length > 0 && (
          <AddTalliesCard color="neutral">
            <div
              style={{
                display: 'flex',
                gap: '1rem',
              }}
            >
              <div style={{ flex: 1 }}>
                <FieldName>Ballot Style</FieldName>
                <SearchSelect
                  id="selectBallotStyle"
                  ariaLabel="Ballot Style"
                  options={[
                    ...selectableBallotStyles.map((bs) => ({
                      label: bs.id,
                      value: bs.id,
                    })),
                  ]}
                  value={selectedBallotStyle?.id}
                  onChange={handleBallotStyleSelect}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <FieldName>Precinct</FieldName>
                <SearchSelect
                  id="selectPrecinct"
                  ariaLabel="Precinct"
                  options={selectablePrecincts.map((p) => ({
                    label: p.name,
                    value: p.id,
                  }))}
                  value={selectedPrecinct?.id}
                  onChange={handlePrecinctSelect}
                  disabled={!selectedBallotStyle}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <FieldName>Voting Method</FieldName>
                <SearchSelect
                  id="selectBallotType"
                  ariaLabel="Voting Method"
                  options={selectableBallotTypes.map((bt) => ({
                    label: bt === 'absentee' ? 'Absentee' : 'Precinct',
                    value: bt,
                  }))}
                  value={selectedVotingMethod}
                  onChange={handleBallotTypeSelect}
                  disabled={!selectedPrecinct}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'end',
                marginTop: '0.5rem',
              }}
            >
              {selectedBallotStyle &&
              selectedPrecinct &&
              selectedVotingMethod ? (
                <LinkButton
                  disabled={
                    !(
                      selectedBallotStyle &&
                      selectedPrecinct &&
                      selectedVotingMethod
                    )
                  }
                  icon="Add"
                  variant="primary"
                  to={routerPaths.manualDataEntry({
                    ballotStyleId: selectedBallotStyle.id,
                    precinctId: selectedPrecinct.id,
                    votingMethod: selectedVotingMethod,
                  })}
                >
                  Add Tallies
                </LinkButton>
              ) : (
                <LinkButton icon="Add" disabled>
                  Add Tallies
                </LinkButton>
              )}
            </div>
          </AddTalliesCard>
        )}
        {hasManualTally && (
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
                  <TD as="th" narrow nowrap>
                    Ballot Count
                  </TD>
                  <TD as="th" narrow nowrap />
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
                      <TD nowrap data-testid="numBallots">
                        {metadata.ballotCount.toLocaleString()}
                      </TD>
                      <TD nowrap>
                        <LinkButton
                          icon="Edit"
                          fill="transparent"
                          to={routerPaths.manualDataEntry(metadata)}
                          style={{ marginRight: '0.5rem' }}
                        >
                          Edit
                        </LinkButton>
                        <Button
                          icon="Delete"
                          color="danger"
                          fill="transparent"
                          onPress={() => setManualTallyToRemove(metadata)}
                        >
                          Remove
                        </Button>
                      </TD>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </SummaryTableWrapper>
        )}
        {hasManualTally && (
          <P
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: '1rem',
            }}
          >
            <Button
              icon="Delete"
              color="danger"
              onPress={() => setIsClearingAll(true)}
            >
              Remove All Manual Tallies
            </Button>
          </P>
        )}
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
