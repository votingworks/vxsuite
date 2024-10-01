import {
  assertDefined,
  find,
  iter,
  throwIllegalValue,
  unique,
} from '@votingworks/basics';
import {
  H3,
  Icons,
  P,
  Button,
  Table,
  TD,
  Loading,
  Card,
  TabPanel,
} from '@votingworks/ui';
import { DateTime } from 'luxon';
import { useContext, useState } from 'react';
import styled from 'styled-components';
import { format } from '@votingworks/utils';
import { TIME_FORMAT } from '../../config/globals';
import { ResultsFileType } from '../../config/types';
import { AppContext } from '../../contexts/app_context';
import {
  clearCastVoteRecordFiles,
  deleteAllManualResults,
  getCastVoteRecordFileMode,
  getCastVoteRecordFiles,
  getManualResultsMetadata,
} from '../../api';
import { ImportCvrFilesModal } from './import_cvrfiles_modal';
import { ConfirmRemovingFileModal } from './confirm_removing_file_modal';

const TestModeCard = styled(Card).attrs({ color: 'warning' })`
  margin-bottom: 1rem;
`;

const Actions = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
`;

export function CastVoteRecordsTab(): JSX.Element {
  const { electionDefinition, isOfficialResults } = useContext(AppContext);
  const { election } = assertDefined(electionDefinition);

  function getPrecinctNames(precinctIds: readonly string[]) {
    return precinctIds
      .map((id) => find(election.precincts, (p) => p.id === id).name)
      .join(', ');
  }

  const [isImportCvrModalOpen, setIsImportCvrModalOpen] = useState(false);

  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const castVoteRecordFilesQuery = getCastVoteRecordFiles.useQuery();
  const manualTallyMetadataQuery = getManualResultsMetadata.useQuery();
  const clearCastVoteRecordFilesMutation =
    clearCastVoteRecordFiles.useMutation();
  const deleteAllManualTalliesMutation = deleteAllManualResults.useMutation();

  const [confirmingRemoveFileType, setConfirmingRemoveFileType] =
    useState<ResultsFileType>();

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

  if (
    !castVoteRecordFilesQuery.isSuccess ||
    !castVoteRecordFileModeQuery.isSuccess ||
    !manualTallyMetadataQuery.isSuccess
  ) {
    return <Loading />;
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
  const fileMode = castVoteRecordFileModeQuery.data;

  const castVoteRecordFileList = castVoteRecordFilesQuery.data;
  const hasAnyFiles = castVoteRecordFileList.length > 0 || hasManualTally;

  return (
    <TabPanel>
      {fileMode === 'test' && (
        <TestModeCard>
          <H3>
            <Icons.Warning color="warning" /> Test Ballot Mode
          </H3>
          Once you have completed L&A testing and are ready to tally official
          ballots, remove the test ballot CVRs.
        </TestModeCard>
      )}
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
                    {DateTime.fromJSDate(new Date(exportTimestamp)).toFormat(
                      TIME_FORMAT
                    )}
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
      {confirmingRemoveFileType && (
        <ConfirmRemovingFileModal
          fileType={confirmingRemoveFileType}
          onConfirm={confirmRemoveFiles}
          onCancel={cancelConfirmingRemoveFiles}
        />
      )}
      {isImportCvrModalOpen && (
        <ImportCvrFilesModal onClose={() => setIsImportCvrModalOpen(false)} />
      )}
    </TabPanel>
  );
}
