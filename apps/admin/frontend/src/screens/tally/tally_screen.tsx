import React, { useContext, useState } from 'react';
import { DateTime } from 'luxon';

import { format, isElectionManagerAuth } from '@votingworks/utils';
import {
  assert,
  find,
  iter,
  throwIllegalValue,
  unique,
} from '@votingworks/basics';
import {
  Button,
  Table,
  TD,
  LinkButton,
  H2,
  P,
  Icons,
  Card,
  H3,
} from '@votingworks/ui';
import styled from 'styled-components';
import { ResultsFileType } from '../../config/types';

import { AppContext } from '../../contexts/app_context';

import { NavigationScreen } from '../../components/navigation_screen';
import { routerPaths } from '../../router_paths';
import { ImportCvrFilesModal } from './import_cvrfiles_modal';
import { ConfirmRemovingFileModal } from './confirm_removing_file_modal';
import { TIME_FORMAT } from '../../config/globals';
import {
  clearCastVoteRecordFiles,
  deleteAllManualResults,
  getCastVoteRecordFileMode,
  getCastVoteRecordFiles,
  getManualResultsMetadata,
} from '../../api';
import { Loading } from '../../components/loading';
import { RemoveAllManualTalliesModal } from './remove_all_manual_tallies_modal';
import { OfficialResultsCard } from '../../components/official_results_card';

const TestModeCard = styled(Card).attrs({ color: 'warning' })`
  margin-bottom: 1rem;
`;

const Actions = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
`;

const Section = styled.section`
  margin-bottom: 2rem;
`;

export function TallyScreen(): JSX.Element | null {
  const { electionDefinition, isOfficialResults, auth } =
    useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth));
  const { election } = electionDefinition;

  const clearCastVoteRecordFilesMutation =
    clearCastVoteRecordFiles.useMutation();
  const deleteAllManualTalliesMutation = deleteAllManualResults.useMutation();

  const [confirmingRemoveFileType, setConfirmingRemoveFileType] =
    useState<ResultsFileType>();
  const [
    isConfirmingRemoveAllManualTallies,
    setIsConfirmingRemoveAllManualTallies,
  ] = useState(false);
  const [isImportCvrModalOpen, setIsImportCvrModalOpen] = useState(false);

  function beginConfirmRemoveFiles(fileType: ResultsFileType) {
    setConfirmingRemoveFileType(fileType);
  }
  function cancelConfirmingRemoveFiles() {
    setConfirmingRemoveFileType(undefined);
  }
  function confirmRemoveFiles(fileType: ResultsFileType) {
    switch (fileType) {
      case ResultsFileType.CastVoteRecord:
        clearCastVoteRecordFilesMutation.mutate();
        break;
      case ResultsFileType.All:
        deleteAllManualTalliesMutation.mutate();
        clearCastVoteRecordFilesMutation.mutate();
        break;
      /** istanbul ignore next */
      default:
        throwIllegalValue(fileType);
    }
    setConfirmingRemoveFileType(undefined);
  }

  function getPrecinctNames(precinctIds: readonly string[]) {
    return precinctIds
      .map((id) => find(election.precincts, (p) => p.id === id).name)
      .join(', ');
  }

  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const castVoteRecordFilesQuery = getCastVoteRecordFiles.useQuery();
  const manualTallyMetadataQuery = getManualResultsMetadata.useQuery();

  if (
    !castVoteRecordFilesQuery.isSuccess ||
    !castVoteRecordFileModeQuery.isSuccess ||
    !manualTallyMetadataQuery.isSuccess
  ) {
    return (
      <NavigationScreen title="Tally">
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  const manualTallyMetadata = manualTallyMetadataQuery.data;
  const hasManualTally = manualTallyMetadata.length > 0;
  const manualTallyTotalBallotCount = iter(manualTallyMetadata)
    .map(({ ballotCount }) => ballotCount)
    .sum();
  const manualTallyPrecinctIds = unique(
    manualTallyMetadata.map((metadata) => metadata.precinctId)
  );
  const manualTallyFirstAdded =
    iter(manualTallyMetadata)
      .map((metadata) => new Date(metadata.createdAt))
      .minBy((d) => d.valueOf()) ?? new Date();

  const castVoteRecordFileList = castVoteRecordFilesQuery.data;
  const hasAnyFiles = castVoteRecordFileList.length > 0 || hasManualTally;

  const fileMode = castVoteRecordFileModeQuery.data;

  return (
    <React.Fragment>
      <NavigationScreen title="Tally">
        {isOfficialResults && (
          <OfficialResultsCard>
            <H3>
              <Icons.Done color="success" />
              Election Results Marked as Official
            </H3>
            <Button
              disabled={!hasAnyFiles}
              onPress={() => beginConfirmRemoveFiles(ResultsFileType.All)}
              icon="Delete"
              color="danger"
            >
              Clear All Results
            </Button>
          </OfficialResultsCard>
        )}

        {fileMode === 'test' && (
          <TestModeCard>
            <H3>
              <Icons.Warning color="warning" /> Test Ballot Mode
            </H3>
            Once you have completed L&A testing and are ready to tally official
            ballots, remove the test ballot CVRs.
          </TestModeCard>
        )}

        <Section>
          <H2>Cast Vote Records (CVRs)</H2>
          {!hasAnyFiles && <P>No CVRs loaded.</P>}
          <Actions>
            <Button
              icon="Import"
              variant="primary"
              disabled={isOfficialResults}
              onPress={() => setIsImportCvrModalOpen(true)}
            >
              Load CVRs
            </Button>
            {hasAnyFiles && (
              <Button
                icon="Delete"
                color="danger"
                disabled={isOfficialResults}
                onPress={() =>
                  beginConfirmRemoveFiles(ResultsFileType.CastVoteRecord)
                }
              >
                Remove CVRs
              </Button>
            )}
          </Actions>
          {hasAnyFiles && (
            <Table data-testid="loaded-file-table">
              <tbody>
                <tr>
                  <TD as="th" narrow nowrap textAlign="right">
                    #
                  </TD>
                  <TD as="th" narrow nowrap>
                    Created At
                  </TD>
                  <TD as="th" nowrap>
                    CVR Count
                  </TD>
                  <TD as="th" narrow nowrap>
                    Source
                  </TD>
                  <TD as="th" nowrap>
                    Precinct
                  </TD>
                </tr>
                {castVoteRecordFileList.map(
                  (
                    {
                      filename,
                      exportTimestamp,
                      numCvrsImported,
                      scannerIds,
                      precinctIds,
                    },
                    cvrFileIndex
                  ) => (
                    <tr key={filename}>
                      <TD narrow nowrap textAlign="right">
                        {cvrFileIndex + 1}.
                      </TD>
                      <TD narrow nowrap>
                        {DateTime.fromJSDate(
                          new Date(exportTimestamp)
                        ).toFormat(TIME_FORMAT)}
                      </TD>
                      <TD nowrap>{format.count(numCvrsImported)} </TD>
                      <TD narrow nowrap>
                        {scannerIds.join(', ')}
                      </TD>
                      <TD>{getPrecinctNames(precinctIds)}</TD>
                    </tr>
                  )
                )}
                {hasManualTally ? (
                  <tr key="manual-data">
                    <TD />
                    <TD narrow nowrap>
                      {DateTime.fromJSDate(manualTallyFirstAdded).toFormat(
                        TIME_FORMAT
                      )}
                    </TD>
                    <TD narrow>{format.count(manualTallyTotalBallotCount)}</TD>
                    <TD narrow nowrap>
                      Manual Tallies
                    </TD>
                    <TD>{getPrecinctNames(manualTallyPrecinctIds)}</TD>
                  </tr>
                ) : null}
                <tr>
                  <TD />
                  <TD as="th" narrow nowrap>
                    Total CVR Count
                  </TD>
                  <TD as="th" narrow data-testid="total-cvr-count">
                    {format.count(
                      iter(castVoteRecordFileList)
                        .map((record) => record.numCvrsImported)
                        .sum() + manualTallyTotalBallotCount
                    )}
                  </TD>
                  <TD />
                  <TD as="th" />
                </tr>
              </tbody>
            </Table>
          )}
        </Section>

        <Section>
          <H2>Manual Tallies</H2>
          <P>
            <LinkButton
              icon={hasManualTally ? 'Edit' : 'Add'}
              to={routerPaths.manualDataSummary}
              disabled={isOfficialResults}
            >
              {hasManualTally ? 'Edit Manual Tallies' : 'Add Manual Tallies'}
            </LinkButton>{' '}
            {hasManualTally && (
              <Button
                icon="Delete"
                color="danger"
                disabled={isOfficialResults}
                onPress={() => setIsConfirmingRemoveAllManualTallies(true)}
              >
                Remove Manual Tallies
              </Button>
            )}
          </P>
        </Section>
      </NavigationScreen>
      {confirmingRemoveFileType && (
        <ConfirmRemovingFileModal
          fileType={confirmingRemoveFileType}
          onConfirm={confirmRemoveFiles}
          onCancel={cancelConfirmingRemoveFiles}
        />
      )}
      {isConfirmingRemoveAllManualTallies && (
        <RemoveAllManualTalliesModal
          onClose={() => setIsConfirmingRemoveAllManualTallies(false)}
        />
      )}
      {isImportCvrModalOpen && (
        <ImportCvrFilesModal onClose={() => setIsImportCvrModalOpen(false)} />
      )}
    </React.Fragment>
  );
}
