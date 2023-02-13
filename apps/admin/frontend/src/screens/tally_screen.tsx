import React, { useContext, useState, useRef } from 'react';
import moment from 'moment';

import { Admin } from '@votingworks/api';
import { format } from '@votingworks/utils';
import { assert, find } from '@votingworks/basics';
import {
  Button,
  isElectionManagerAuth,
  Prose,
  Table,
  TD,
  Text,
} from '@votingworks/shared-frontend';
import { ExternalTallySourceType } from '@votingworks/types';
import { InputEventFunction, ResultsFileType } from '../config/types';

import { AppContext } from '../contexts/app_context';
import { getPrecinctIdsInExternalTally } from '../utils/external_tallies';

import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';
import { LinkButton } from '../components/link_button';
import { ImportCvrFilesModal } from '../components/import_cvrfiles_modal';
import { FileInputButton } from '../components/file_input_button';
import { ConfirmRemovingFileModal } from '../components/confirm_removing_file_modal';
import { TIME_FORMAT } from '../config/globals';
import { ImportExternalResultsModal } from '../components/import_external_results_modal';
import { useCvrFileModeQuery } from '../hooks/use_cvr_file_mode_query';
import { useCvrFilesQuery } from '../hooks/use_cvr_files_query';
import { Loading } from '../components/loading';

export function TallyScreen(): JSX.Element {
  const {
    electionDefinition,
    converter,
    isOfficialResults,
    fullElectionExternalTallies,
    resetFiles,
    auth,
  } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth));
  const { election } = electionDefinition;
  const externalFileInput = useRef<HTMLInputElement>(null);

  const [confirmingRemoveFileType, setConfirmingRemoveFileType] =
    useState<ResultsFileType>();
  const [isImportCvrModalOpen, setIsImportCvrModalOpen] = useState(false);

  function beginConfirmRemoveFiles(fileType: ResultsFileType) {
    setConfirmingRemoveFileType(fileType);
  }
  function cancelConfirmingRemoveFiles() {
    setConfirmingRemoveFileType(undefined);
  }
  async function confirmRemoveFiles(fileType: ResultsFileType) {
    setConfirmingRemoveFileType(undefined);
    await resetFiles(fileType);
  }

  function getPrecinctNames(precinctIds: readonly string[]) {
    return precinctIds
      .map((id) => find(election.precincts, (p) => p.id === id).name)
      .join(', ');
  }

  const cvrFilesQuery = useCvrFilesQuery();
  const castVoteRecordFileList =
    cvrFilesQuery.isLoading || cvrFilesQuery.isError ? [] : cvrFilesQuery.data;
  const hasAnyFiles =
    castVoteRecordFileList.length > 0 || fullElectionExternalTallies.size > 0;
  const hasExternalSemsFile = fullElectionExternalTallies.has(
    ExternalTallySourceType.SEMS
  );
  const hasExternalManualData = fullElectionExternalTallies.has(
    ExternalTallySourceType.Manual
  );

  const [isImportExternalModalOpen, setIsImportExternalModalOpen] =
    useState(false);
  const [externalResultsSelectedFile, setExternalResultsSelectedFile] =
    useState<File>();

  const importExternalSemsFile: InputEventFunction = (event) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    if (files.length === 1) {
      setIsImportExternalModalOpen(true);
      setExternalResultsSelectedFile(files[0]);
    }
  };

  function closeExternalFileImport() {
    setIsImportExternalModalOpen(false);
    setExternalResultsSelectedFile(undefined);
    if (externalFileInput?.current) {
      externalFileInput.current.value = '';
    }
  }

  const fileMode = useCvrFileModeQuery().data;
  const fileModeText =
    fileMode === Admin.CvrFileMode.Test
      ? 'Currently tallying test ballots. Once you have completed L&A testing and are ready to start tallying live ballots remove all of the loaded CVR files before loading live ballot results.'
      : fileMode === Admin.CvrFileMode.Official
      ? 'Currently tallying live ballots.'
      : '';

  const externalTallyRows = Array.from(
    fullElectionExternalTallies.values()
  ).map((t) => {
    const precinctsInExternalFile = getPrecinctIdsInExternalTally(t);
    return (
      <tr key={t.inputSourceName}>
        <TD narrow nowrap>
          {moment(t.timestampCreated).format(TIME_FORMAT)}
        </TD>
        <TD narrow>{format.count(t.overallTally.numberOfBallotsCounted)}</TD>
        <TD narrow nowrap>
          External Results ({t.inputSourceName})
        </TD>
        <TD>{getPrecinctNames(precinctsInExternalFile)}</TD>
      </tr>
    );
  });
  const externalFileBallotCount = Array.from(
    fullElectionExternalTallies.values()
  ).reduce(
    (prev, tally) => prev + tally.overallTally.numberOfBallotsCounted,
    0
  );

  return (
    <React.Fragment>
      <NavigationScreen>
        <Prose maxWidth={false}>
          <h1>Cast Vote Record (CVR) Management</h1>
          <Text>{fileModeText}</Text>
          {isOfficialResults && (
            <Button
              danger
              disabled={!hasAnyFiles}
              onPress={() => beginConfirmRemoveFiles(ResultsFileType.All)}
            >
              Clear All Tallies and Results
            </Button>
          )}

          <p>
            <Button
              primary
              disabled={isOfficialResults}
              onPress={() => setIsImportCvrModalOpen(true)}
            >
              Load CVR Files
            </Button>{' '}
            <Button
              disabled={
                cvrFilesQuery.isLoading ||
                castVoteRecordFileList.length === 0 ||
                isOfficialResults
              }
              onPress={() =>
                beginConfirmRemoveFiles(ResultsFileType.CastVoteRecord)
              }
            >
              Remove CVR Files
            </Button>
          </p>
          <Table data-testid="loaded-file-table">
            <tbody>
              {hasAnyFiles ? (
                <React.Fragment>
                  <tr>
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
                  {cvrFilesQuery.isLoading ? (
                    <tr>
                      <TD>
                        <Loading />
                      </TD>
                    </tr>
                  ) : (
                    castVoteRecordFileList.map(
                      ({
                        filename,
                        exportTimestamp,
                        numCvrsImported,
                        scannerIds,
                        precinctIds,
                      }) => (
                        <tr key={filename}>
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
                    )
                  )}
                  {externalTallyRows}
                  <tr>
                    <TD as="th" narrow nowrap>
                      Total CVRs Count
                    </TD>
                    <TD as="th" narrow data-testid="total-cvr-count">
                      {format.count(
                        castVoteRecordFileList.reduce(
                          (prev, curr) => prev + curr.numCvrsImported,
                          0
                        ) + externalFileBallotCount
                      )}
                    </TD>
                    <TD />
                    <TD as="th" />
                  </tr>
                </React.Fragment>
              ) : (
                <tr>
                  <TD colSpan={2}>
                    <em>No CVR files loaded.</em>
                  </TD>
                </tr>
              )}
            </tbody>
          </Table>
          <h2>Manually Entered Results</h2>
          <p>
            <LinkButton
              to={routerPaths.manualDataImport}
              disabled={isOfficialResults}
            >
              {hasExternalManualData
                ? 'Edit Manually Entered Results'
                : 'Add Manually Entered Results'}
            </LinkButton>{' '}
            <Button
              disabled={!hasExternalManualData || isOfficialResults}
              onPress={() => beginConfirmRemoveFiles(ResultsFileType.Manual)}
            >
              Remove Manual Data
            </Button>
          </p>
          {converter === 'ms-sems' && (
            <React.Fragment>
              <h2>External Results</h2>
              <p>
                <FileInputButton
                  innerRef={externalFileInput}
                  onChange={importExternalSemsFile}
                  accept="*"
                  data-testid="import-sems-button"
                  disabled={hasExternalSemsFile || isOfficialResults}
                >
                  Load External Results File
                </FileInputButton>{' '}
                <Button
                  disabled={!hasExternalSemsFile || isOfficialResults}
                  onPress={() => beginConfirmRemoveFiles(ResultsFileType.SEMS)}
                >
                  Remove External Results File
                </Button>
              </p>
            </React.Fragment>
          )}
        </Prose>
      </NavigationScreen>
      {confirmingRemoveFileType && (
        <ConfirmRemovingFileModal
          fileType={confirmingRemoveFileType}
          onConfirm={confirmRemoveFiles}
          onCancel={cancelConfirmingRemoveFiles}
        />
      )}
      {isImportExternalModalOpen && (
        <ImportExternalResultsModal
          onClose={closeExternalFileImport}
          selectedFile={externalResultsSelectedFile}
        />
      )}
      {isImportCvrModalOpen && (
        <ImportCvrFilesModal onClose={() => setIsImportCvrModalOpen(false)} />
      )}
    </React.Fragment>
  );
}
