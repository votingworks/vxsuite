import { assert, iter } from '@votingworks/basics';
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
  TabPanel,
  Icons,
} from '@votingworks/ui';
import {
  getBallotStyleGroupsForPrecinctOrSplit,
  getGroupedBallotStyles,
  isElectionManagerAuth,
} from '@votingworks/utils';
import {
  BallotStyleGroup,
  Election,
  getAllPrecinctsAndSplits,
  PrecinctOrSplit,
} from '@votingworks/types';
import type {
  ManualResultsVotingMethod,
  ManualResultsIdentifier,
} from '@votingworks/admin-backend';
import { routerPaths } from '../../router_paths';

import { AppContext } from '../../contexts/app_context';
import { ConfirmRemoveAllManualTalliesModal } from './confirm_remove_all_manual_tallies_modal';
import { deleteManualResults, getManualResultsMetadata } from '../../api';
import { ImportElectionsResultReportingFileModal } from './import_election_results_reporting_file_modal';
import {
  BallotStyleLabel,
  VotingMethodLabel,
} from './manual_tallies_shared_components';

export const TITLE = 'Manual Tallies';

export const ALL_MANUAL_TALLY_BALLOT_TYPES: ManualResultsVotingMethod[] = [
  'precinct',
  'absentee',
  'early-voting',
];

function getAllPossibleManualTallyIdentifiers(
  election: Election
): ManualResultsIdentifier[] {
  return getGroupedBallotStyles(election.ballotStyles).flatMap((bs) =>
    bs.precincts.flatMap((precinctId) =>
      ALL_MANUAL_TALLY_BALLOT_TYPES.flatMap((votingMethod) => [
        {
          ballotStyleGroupId: bs.id,
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
    deleteManualTallyMutation.mutate(
      {
        ballotStyleGroupId: identifier.ballotStyleGroupId,
        precinctId: identifier.precinctId,
        votingMethod: identifier.votingMethod,
      },
      { onSuccess: onClose }
    );
  }

  return (
    <Modal
      title="Remove Manual Tallies"
      content={
        <React.Fragment>
          <P>
            The selected manual tallies will be permanently deleted and removed
            from reports.
          </P>
          <P>
            <Font weight="bold">Ballot Style:</Font>{' '}
            <BallotStyleLabel
              election={election}
              ballotStyleGroupId={identifier.ballotStyleGroupId}
              precinctId={identifier.precinctId}
            />
            <br />
            <Font weight="bold">Voting Method:</Font>{' '}
            <VotingMethodLabel votingMethod={identifier.votingMethod} />
          </P>
        </React.Fragment>
      }
      actions={
        <React.Fragment>
          <Button
            icon="Delete"
            variant="danger"
            onPress={onConfirm}
            disabled={deleteManualTallyMutation.isLoading}
          >
            Remove Manual Tallies
          </Button>
          <Button
            onPress={onClose}
            disabled={deleteManualTallyMutation.isLoading}
          >
            Cancel
          </Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
    />
  );
}

interface PrecinctAndBallotStyle {
  precinctOrSplit: PrecinctOrSplit;
  ballotStyleGroup: BallotStyleGroup;
}

export function ManualTalliesTab(): JSX.Element | null {
  const { electionDefinition, auth, isOfficialResults } =
    useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for adding manual tally data
  const { election } = electionDefinition;

  const getManualTallyMetadataQuery = getManualResultsMetadata.useQuery();

  const manualTallyMetadataRecords = useMemo(() => {
    if (!getManualTallyMetadataQuery.data) return [];

    return [...getManualTallyMetadataQuery.data].sort(
      (metadataA, metadataB) =>
        metadataA.ballotStyleGroupId.localeCompare(
          metadataB.ballotStyleGroupId
        ) ||
        metadataA.precinctId.localeCompare(metadataB.precinctId) ||
        metadataA.votingMethod.localeCompare(metadataB.votingMethod)
    );
  }, [getManualTallyMetadataQuery.data]);
  const hasManualTally = manualTallyMetadataRecords.length > 0;
  const totalNumberBallotsEntered = iter(manualTallyMetadataRecords)
    .map(({ ballotCount }) => ballotCount)
    .sum();

  const [isClearingAll, setIsClearingAll] = useState(false);

  const [manualTallyToRemove, setManualTallyToRemove] =
    useState<ManualResultsIdentifier>();

  // metadata for tallies which do not exist yet and thus could be added
  const uncreatedManualTallyMetadata = useMemo(
    () =>
      getAllPossibleManualTallyIdentifiers(election).filter(
        (identifier) =>
          !manualTallyMetadataRecords.some(
            ({ ballotStyleGroupId, precinctId, votingMethod }) =>
              ballotStyleGroupId === identifier.ballotStyleGroupId &&
              precinctId === identifier.precinctId &&
              votingMethod === identifier.votingMethod
          )
      ),
    [election, manualTallyMetadataRecords]
  );

  const [selectedPrecinctAndBallotStyle, setSelectedPrecinctAndBallotStyle] =
    useState<PrecinctAndBallotStyle>();
  const [selectedVotingMethod, setSelectedBallotType] =
    useState<ManualResultsVotingMethod>();
  const [showUploadTalliesModal, setShowUploadTalliesModal] =
    useState<boolean>();

  const selectablePrecinctAndBallotStyles = getAllPrecinctsAndSplits(election)
    .flatMap((precinctOrSplit) =>
      getBallotStyleGroupsForPrecinctOrSplit({
        election,
        precinctOrSplit,
      }).map((ballotStyleGroup) => ({
        precinctOrSplit,
        ballotStyleGroup,
      }))
    )
    .filter(({ precinctOrSplit, ballotStyleGroup }) =>
      uncreatedManualTallyMetadata.some(
        (metadata) =>
          metadata.precinctId === precinctOrSplit.precinct.id &&
          metadata.ballotStyleGroupId === ballotStyleGroup.id
      )
    );

  const selectableVotingMethods: ManualResultsVotingMethod[] =
    selectedPrecinctAndBallotStyle
      ? ALL_MANUAL_TALLY_BALLOT_TYPES.filter((votingMethod) =>
          uncreatedManualTallyMetadata.some(
            (metadata) =>
              metadata.ballotStyleGroupId ===
                selectedPrecinctAndBallotStyle.ballotStyleGroup.id &&
              metadata.precinctId ===
                selectedPrecinctAndBallotStyle.precinctOrSplit.precinct.id &&
              metadata.votingMethod === votingMethod
          )
        )
      : [];

  function handlePrecinctAndBallotStyleSelect(value?: PrecinctAndBallotStyle) {
    setSelectedPrecinctAndBallotStyle(value);
    setSelectedBallotType(undefined);
  }

  function handleBallotTypeSelect(value?: string) {
    setSelectedBallotType(value as ManualResultsVotingMethod);
  }

  function onPressUploadTallies() {
    setShowUploadTalliesModal(true);
  }

  if (
    showUploadTalliesModal &&
    selectedPrecinctAndBallotStyle &&
    selectedVotingMethod
  ) {
    return (
      <ImportElectionsResultReportingFileModal
        onClose={() => {
          setShowUploadTalliesModal(false);
        }}
        ballotStyleGroupId={selectedPrecinctAndBallotStyle.ballotStyleGroup.id}
        precinctId={selectedPrecinctAndBallotStyle.precinctOrSplit.precinct.id}
        votingMethod={selectedVotingMethod}
      />
    );
  }

  if (!getManualTallyMetadataQuery.isSuccess) {
    return null;
  }

  return (
    <TabPanel>
      {!hasManualTally && <P>No manual tallies entered.</P>}
      {uncreatedManualTallyMetadata.length > 0 && (
        <AddTalliesCard color="neutral">
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              alignItems: 'end',
            }}
          >
            <div style={{ flex: 1 }}>
              <FieldName>Ballot Style</FieldName>
              <SearchSelect
                id="selectPrecinctAndBallotStyle"
                aria-label="Ballot Style"
                options={selectablePrecinctAndBallotStyles.map(
                  ({ precinctOrSplit, ballotStyleGroup }) => ({
                    label: BallotStyleLabel({
                      election,
                      ballotStyleGroupId: ballotStyleGroup.id,
                      precinctId: precinctOrSplit.precinct.id,
                    }),
                    value: { precinctOrSplit, ballotStyleGroup },
                  })
                )}
                value={selectedPrecinctAndBallotStyle}
                disabled={isOfficialResults}
                onChange={handlePrecinctAndBallotStyleSelect}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ width: '7rem' }}>
              <FieldName>Voting Method</FieldName>
              <SearchSelect
                id="selectBallotType"
                aria-label="Voting Method"
                options={selectableVotingMethods.map((votingMethod) => ({
                  label: VotingMethodLabel({ votingMethod }),
                  value: votingMethod,
                }))}
                value={selectedVotingMethod}
                onChange={handleBallotTypeSelect}
                disabled={!selectedPrecinctAndBallotStyle}
                style={{ width: '100%' }}
              />
            </div>
            <LinkButton
              disabled={
                !(selectedPrecinctAndBallotStyle && selectedVotingMethod)
              }
              icon="Add"
              variant="primary"
              to={
                selectedPrecinctAndBallotStyle &&
                selectedVotingMethod &&
                routerPaths.tallyManualForm({
                  ballotStyleGroupId:
                    selectedPrecinctAndBallotStyle.ballotStyleGroup.id,
                  precinctId:
                    selectedPrecinctAndBallotStyle.precinctOrSplit.precinct.id,
                  votingMethod: selectedVotingMethod,
                })
              }
            >
              Enter Tallies
            </LinkButton>
            <Button
              disabled={
                !(selectedPrecinctAndBallotStyle && selectedVotingMethod)
              }
              icon="Import"
              variant="secondary"
              onPress={onPressUploadTallies}
            >
              Import Results
            </Button>
          </div>
        </AddTalliesCard>
      )}
      {hasManualTally && (
        <SummaryTableWrapper>
          <Table condensed data-testid="summary-data">
            <thead>
              <tr>
                <TD as="th" nowrap>
                  Ballot Style
                </TD>
                <TD as="th" nowrap>
                  Voting Method
                </TD>
                <TD as="th" narrow nowrap>
                  Ballot Count
                </TD>
                <TD as="th" narrow nowrap />
                <TD as="th" narrow nowrap />
              </tr>
            </thead>
            <tbody>
              {manualTallyMetadataRecords.map((metadata) => (
                <tr
                  key={`${metadata.precinctId}-${metadata.ballotStyleGroupId}-${metadata.votingMethod}`}
                >
                  <TD>
                    <BallotStyleLabel
                      election={election}
                      ballotStyleGroupId={metadata.ballotStyleGroupId}
                      precinctId={metadata.precinctId}
                    />
                  </TD>
                  <TD>
                    <VotingMethodLabel votingMethod={metadata.votingMethod} />
                  </TD>
                  <TD nowrap data-testid="numBallots">
                    {metadata.ballotCount.toLocaleString()}
                  </TD>
                  <TD narrow nowrap>
                    {metadata.validationError === 'invalid' && (
                      <React.Fragment>
                        <Icons.Warning color="warning" /> Invalid
                      </React.Fragment>
                    )}
                    {metadata.validationError === 'incomplete' && (
                      <React.Fragment>
                        <Icons.Info /> Incomplete
                      </React.Fragment>
                    )}
                  </TD>
                  <TD nowrap style={{ minWidth: '14rem' }}>
                    <LinkButton
                      icon="Edit"
                      fill="transparent"
                      to={routerPaths.tallyManualForm(metadata)}
                      disabled={isOfficialResults}
                    >
                      Edit
                    </LinkButton>
                    <Button
                      icon="Delete"
                      color="danger"
                      fill="transparent"
                      onPress={() => setManualTallyToRemove(metadata)}
                      disabled={isOfficialResults}
                    >
                      Remove
                    </Button>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        </SummaryTableWrapper>
      )}
      {hasManualTally && (
        <P
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '1rem',
          }}
        >
          <Font weight="semiBold">
            Total Manual Ballot Count:{' '}
            {totalNumberBallotsEntered.toLocaleString()}
          </Font>
          <Button
            icon="Delete"
            color="danger"
            onPress={() => setIsClearingAll(true)}
            disabled={isOfficialResults}
          >
            Remove All Manual Tallies
          </Button>
        </P>
      )}
      {isClearingAll && (
        <ConfirmRemoveAllManualTalliesModal
          onClose={() => setIsClearingAll(false)}
        />
      )}
      {manualTallyToRemove && (
        <RemoveManualTallyModal
          identifier={manualTallyToRemove}
          election={election}
          onClose={() => setManualTallyToRemove(undefined)}
        />
      )}
    </TabPanel>
  );
}
