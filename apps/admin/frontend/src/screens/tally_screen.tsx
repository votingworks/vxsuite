import React, { useContext, useState } from 'react';
import moment from 'moment';

import { format, isElectionManagerAuth } from '@votingworks/utils';
import { assert, find, throwIllegalValue, unique } from '@votingworks/basics';
import {
  Button,
  Table,
  TD,
  LinkButton,
  H2,
  P,
  Icons,
  Caption,
} from '@votingworks/ui';
import { ResultsFileType } from '../config/types';

import { AppContext } from '../contexts/app_context';

import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';
import { ImportCvrFilesModal } from '../components/import_cvrfiles_modal';
import { ConfirmRemovingFileModal } from '../components/confirm_removing_file_modal';
import { TIME_FORMAT } from '../config/globals';
import {
  clearCastVoteRecordFiles,
  deleteAllManualResults,
  getCastVoteRecordFileMode,
  getCastVoteRecordFiles,
  getManualResultsMetadata,
} from '../api';
import { Loading } from '../components/loading';
import { RemoveAllManualTalliesModal } from '../components/remove_all_manual_tallies_modal';

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
      <NavigationScreen title="Cast Vote Record (CVR) Management">
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  const manualTallyMetadata = manualTallyMetadataQuery.data;
  const hasManualTally = manualTallyMetadata.length > 0;
  const manualTallyTotalBallotCount = manualTallyMetadata.reduce(
    (acc, metadata) => acc + metadata.ballotCount,
    0
  );
  const manualTallyPrecinctIds = unique(
    manualTallyMetadata.map((metadata) => metadata.precinctId)
  );
  const manualTallyFirstAdded = manualTallyMetadata.reduce(
    (firstAdded, metadata) => {
      const currentTallyAdded = new Date(metadata.createdAt);
      if (currentTallyAdded.valueOf() < firstAdded.valueOf()) {
        return currentTallyAdded;
      }

      return firstAdded;
    },
    new Date()
  );

  const castVoteRecordFileList = castVoteRecordFilesQuery.data;
  const hasAnyFiles = castVoteRecordFileList.length > 0 || hasManualTally;

  const fileMode = castVoteRecordFileModeQuery.data;
  const fileModeText =
    fileMode === 'test'
      ? 'Currently tallying test ballots. Once you have completed L&A testing and are ready to start tallying official ballots remove all of the loaded CVR files before loading official ballot results.'
      : fileMode === 'official'
      ? 'Currently tallying official ballots.'
      : '';

  return (
    <React.Fragment>
      <NavigationScreen title="Cast Vote Record (CVR) Management">
        {fileModeText && <P>{fileModeText}</P>}
        {isOfficialResults && (
          <Button
            variant="danger"
            disabled={!hasAnyFiles}
            onPress={() => beginConfirmRemoveFiles(ResultsFileType.All)}
          >
            Clear All Tallies and Results
          </Button>
        )}

        <P>
          <Button
            variant="primary"
            disabled={isOfficialResults}
            onPress={() => setIsImportCvrModalOpen(true)}
          >
            Load CVR Files
          </Button>{' '}
          <Button
            disabled={fileMode === 'unlocked' || isOfficialResults}
            onPress={() =>
              beginConfirmRemoveFiles(ResultsFileType.CastVoteRecord)
            }
          >
            Remove CVR Files
          </Button>
        </P>
        <Table data-testid="loaded-file-table">
          <tbody>
            {hasAnyFiles ? (
              <React.Fragment>
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
                        {moment(exportTimestamp).format(
                          'MM/DD/YYYY hh:mm:ss A'
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
                      {moment(manualTallyFirstAdded).format(TIME_FORMAT)}
                    </TD>
                    <TD narrow>{format.count(manualTallyTotalBallotCount)}</TD>
                    <TD narrow nowrap>
                      Manually Entered Results
                    </TD>
                    <TD>{getPrecinctNames(manualTallyPrecinctIds)}</TD>
                  </tr>
                ) : null}
                <tr>
                  <TD />
                  <TD as="th" narrow nowrap>
                    Total CVRs Count
                  </TD>
                  <TD as="th" narrow data-testid="total-cvr-count">
                    {format.count(
                      castVoteRecordFileList.reduce(
                        (prev, curr) => prev + curr.numCvrsImported,
                        0
                      ) + manualTallyTotalBallotCount
                    )}
                  </TD>
                  <TD />
                  <TD as="th" />
                </tr>
              </React.Fragment>
            ) : (
              <Caption>
                <Icons.Info /> No CVR files loaded.
              </Caption>
            )}
          </tbody>
        </Table>
        <H2>Manually Entered Results</H2>
        <P>
          <LinkButton
            to={routerPaths.manualDataSummary}
            disabled={isOfficialResults}
          >
            {hasManualTally
              ? 'Edit Manually Entered Results'
              : 'Add Manually Entered Results'}
          </LinkButton>{' '}
          <Button
            disabled={!hasManualTally || isOfficialResults}
            onPress={() => setIsConfirmingRemoveAllManualTallies(true)}
          >
            Remove Manually Entered Results
          </Button>
        </P>
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
