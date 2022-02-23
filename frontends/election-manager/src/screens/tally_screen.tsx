import React, {
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import moment from 'moment';

import {
  assert,
  generateFinalExportDefaultFilename,
  format,
  find,
} from '@votingworks/utils';
import { Table, TD, Modal } from '@votingworks/ui';
import { TallyCategory, ExternalTallySourceType } from '@votingworks/types';
import { LogEventId } from '@votingworks/logging';
import { InputEventFunction, ResultsFileType } from '../config/types';

import { AppContext } from '../contexts/app_context';
import { ConverterClient } from '../lib/converter_client';
import { getPrecinctIdsInExternalTally } from '../utils/external_tallies';

import { Button } from '../components/button';
import { Text } from '../components/text';
import { Loading } from '../components/loading';
import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';
import { LinkButton } from '../components/link_button';
import { HorizontalRule } from '../components/horizontal_rule';
import { Prose } from '../components/prose';
import { ImportCvrFilesModal } from '../components/import_cvrfiles_modal';
import { BallotCountsTable } from '../components/ballot_counts_table';
import { FileInputButton } from '../components/file_input_button';
import { ConfirmRemovingFileModal } from '../components/confirm_removing_file_modal';
import { TIME_FORMAT } from '../config/globals';
import { getPartiesWithPrimaryElections } from '../utils/election';
import { ImportExternalResultsModal } from '../components/import_external_results_modal';
import { SaveFileToUsb, FileType } from '../components/save_file_to_usb';

export function TallyScreen(): JSX.Element {
  const {
    castVoteRecordFiles,
    electionDefinition,
    isOfficialResults,
    saveIsOfficialResults,
    isTabulationRunning,
    fullElectionExternalTallies,
    generateExportableTallies,
    resetFiles,
    logger,
    currentUserSession,
  } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  const isTestMode = castVoteRecordFiles?.fileMode === 'test';
  const externalFileInput = useRef<HTMLInputElement>(null);

  const [
    confirmingRemoveFileType,
    setConfirmingRemoveFileType,
  ] = useState<ResultsFileType>();
  const [isImportCvrModalOpen, setIsImportCvrModalOpen] = useState(false);
  const [isExportResultsModalOpen, setIsExportResultsModalOpen] = useState(
    false
  );

  const [isShowingBatchResults, setIsShowingBatchResults] = useState(false);
  const toggleShowingBatchResults = useCallback(() => {
    setIsShowingBatchResults(!isShowingBatchResults);
  }, [isShowingBatchResults, setIsShowingBatchResults]);

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

  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';
  const [isConfirmingOfficial, setIsConfirmingOfficial] = useState(false);
  function cancelConfirmingOfficial() {
    setIsConfirmingOfficial(false);
  }
  function confirmOfficial() {
    setIsConfirmingOfficial(true);
  }
  async function setOfficial() {
    setIsConfirmingOfficial(false);
    await saveIsOfficialResults();
  }

  function getPrecinctNames(precinctIds: readonly string[]) {
    return precinctIds
      .map((id) => find(election.precincts, (p) => p.id === id).name)
      .join(', ');
  }
  const partiesForPrimaries = getPartiesWithPrimaryElections(election);

  const castVoteRecordFileList = castVoteRecordFiles.fileList;
  const hasCastVoteRecordFiles =
    castVoteRecordFileList.length > 0 || !!castVoteRecordFiles.lastError;
  const hasAnyFiles =
    hasCastVoteRecordFiles || fullElectionExternalTallies.length > 0;
  const hasExternalSemsFile = fullElectionExternalTallies.some(
    (t) => t.source === ExternalTallySourceType.SEMS
  );
  const hasExternalManualData = fullElectionExternalTallies.some(
    (t) => t.source === ExternalTallySourceType.Manual
  );

  const [isImportExternalModalOpen, setIsImportExternalModalOpen] = useState(
    false
  );
  const [
    externalResultsSelectedFile,
    setExternalResultsSelectedFile,
  ] = useState<File>();

  const importExternalSemsFile: InputEventFunction = async (event) => {
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

  const [hasConverter, setHasConverter] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        await new ConverterClient('tallies').getFiles();
        setHasConverter(true);
      } catch {
        setHasConverter(false);
      }
    })();
  }, []);

  const fileMode = castVoteRecordFiles?.fileMode;
  const fileModeText =
    fileMode === 'test'
      ? 'Currently tallying test ballots. Once you have completed L&A testing and are ready to start tallying live ballots remove all of the loaded CVR files before importing live ballot results.'
      : fileMode === 'live'
      ? 'Currently tallying live ballots.'
      : '';

  let tallyResultsInfo = <Loading>Tabulating Results…</Loading>;
  if (!isTabulationRunning) {
    const resultTables = (
      <React.Fragment>
        <h2>Ballot Counts by Precinct</h2>
        <BallotCountsTable breakdownCategory={TallyCategory.Precinct} />
        <h2>Ballot Counts by Voting Method</h2>
        <BallotCountsTable breakdownCategory={TallyCategory.VotingMethod} />
        {partiesForPrimaries.length > 0 && (
          <React.Fragment>
            <h2>Ballot Counts by Party</h2>
            <BallotCountsTable breakdownCategory={TallyCategory.Party} />
          </React.Fragment>
        )}
        <h2>Ballot Counts by Scanner</h2>
        <Button small onPress={toggleShowingBatchResults}>
          {isShowingBatchResults
            ? 'Show Results by Scanner'
            : 'Show Results by Batch and Scanner'}
        </Button>
        <br />
        <br />
        {isShowingBatchResults ? (
          <BallotCountsTable breakdownCategory={TallyCategory.Batch} />
        ) : (
          <BallotCountsTable breakdownCategory={TallyCategory.Scanner} />
        )}
      </React.Fragment>
    );

    tallyResultsInfo = (
      <React.Fragment>
        {resultTables}
        <h2>{statusPrefix} Tally Reports</h2>
        <p>
          <LinkButton to={routerPaths.tallyFullReport}>
            View {statusPrefix} Full Election Tally Report
          </LinkButton>
        </p>
      </React.Fragment>
    );
  }

  const externalTallyRows = fullElectionExternalTallies.map((t) => {
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
  const externalFileBallotCount = fullElectionExternalTallies.reduce(
    (prev, tally) => prev + tally.overallTally.numberOfBallotsCounted,
    0
  );

  const generateSemsResults = useCallback(async (): Promise<string> => {
    assert(currentUserSession);
    await logger.log(
      LogEventId.ConvertingResultsToSemsFormat,
      currentUserSession.type
    );
    const exportableTallies = generateExportableTallies();
    // process on the server
    const client = new ConverterClient('tallies');
    const { inputFiles, outputFiles } = await client.getFiles();
    const [electionDefinitionFile, talliesFile] = inputFiles;
    const resultsFile = outputFiles[0];

    await client.setInputFile(
      electionDefinitionFile.name,
      new File([electionDefinition.electionData], electionDefinitionFile.name, {
        type: 'application/json',
      })
    );
    await client.setInputFile(
      talliesFile.name,
      new File([JSON.stringify(exportableTallies)], 'tallies')
    );
    await client.process();

    // download the result
    const results = await client.getOutputFile(resultsFile.name);

    // reset files on the server
    await client.reset();
    return await results.text();
  }, [
    electionDefinition.electionData,
    generateExportableTallies,
    logger,
    currentUserSession,
  ]);

  return (
    <React.Fragment>
      <NavigationScreen>
        <h1>Election Tally Reports</h1>
        <h2>Cast Vote Record (CVR) files</h2>
        <Text>{fileModeText}</Text>
        <Table data-testid="loaded-file-table">
          <tbody>
            {hasAnyFiles ? (
              <React.Fragment>
                <tr>
                  <TD as="th" narrow nowrap>
                    File Exported At
                  </TD>
                  <TD as="th" nowrap>
                    CVR Count
                  </TD>
                  <TD as="th" narrow nowrap>
                    Scanner ID
                  </TD>
                  <TD as="th" nowrap>
                    Precinct
                  </TD>
                </tr>
                {castVoteRecordFileList.map(
                  ({
                    name,
                    exportTimestamp,
                    importedCvrCount,
                    scannerIds,
                    precinctIds,
                  }) => (
                    <tr key={name}>
                      <TD narrow nowrap>
                        {moment(exportTimestamp).format(
                          'MM/DD/YYYY hh:mm:ss A'
                        )}
                      </TD>
                      <TD nowrap>{format.count(importedCvrCount)} </TD>
                      <TD narrow nowrap>
                        {scannerIds.join(', ')}
                      </TD>
                      <TD>{getPrecinctNames(precinctIds)}</TD>
                    </tr>
                  )
                )}
                {externalTallyRows}
                <tr>
                  <TD as="th" narrow nowrap>
                    Total CVRs Count
                  </TD>
                  <TD as="th" narrow>
                    {format.count(
                      castVoteRecordFileList.reduce(
                        (prev, curr) => prev + curr.importedCvrCount,
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
        <p>
          <Button
            onPress={() => setIsImportCvrModalOpen(true)}
            disabled={isOfficialResults}
          >
            Import CVR Files
          </Button>{' '}
          <FileInputButton
            innerRef={externalFileInput}
            onChange={importExternalSemsFile}
            accept="*"
            data-testid="import-sems-button"
            disabled={hasExternalSemsFile || isOfficialResults}
          >
            Import External Results File
          </FileInputButton>{' '}
          <LinkButton
            to={routerPaths.manualDataImport}
            disabled={isOfficialResults}
          >
            {hasExternalManualData
              ? 'Edit Manually Entered Results'
              : 'Add Manually Entered Results'}
          </LinkButton>{' '}
          <Button
            disabled={!hasCastVoteRecordFiles || isOfficialResults}
            onPress={confirmOfficial}
          >
            Mark Tally Results as Official…
          </Button>
        </p>
        {isOfficialResults ? (
          <p>
            <Button
              danger
              disabled={!hasAnyFiles}
              onPress={() => beginConfirmRemoveFiles(ResultsFileType.All)}
            >
              Clear All Results…
            </Button>
          </p>
        ) : (
          <p>
            <Button
              danger
              disabled={!hasCastVoteRecordFiles}
              onPress={() =>
                beginConfirmRemoveFiles(ResultsFileType.CastVoteRecord)
              }
            >
              Remove CVR Files…
            </Button>{' '}
            <Button
              danger
              disabled={!hasExternalSemsFile}
              onPress={() => beginConfirmRemoveFiles(ResultsFileType.SEMS)}
            >
              Remove External Results File…
            </Button>{' '}
            <Button
              danger
              disabled={!hasExternalManualData}
              onPress={() => beginConfirmRemoveFiles(ResultsFileType.Manual)}
            >
              Remove Manual Data…
            </Button>
          </p>
        )}
        {tallyResultsInfo}
        {hasConverter && hasCastVoteRecordFiles && (
          <React.Fragment>
            <h2>Export Options</h2>
            <p>
              <Button onPress={() => setIsExportResultsModalOpen(true)}>
                Save Results File
              </Button>
            </p>
          </React.Fragment>
        )}
        {!hasCastVoteRecordFiles && (
          <React.Fragment>
            <HorizontalRule />
            <h2>Pre-Election Features</h2>
            <p>
              <LinkButton to={routerPaths.printTestDecks}>
                Print Test Decks
              </LinkButton>{' '}
              <LinkButton to={routerPaths.testDecksTally}>
                View Test Ballot Deck Tally
              </LinkButton>
            </p>
          </React.Fragment>
        )}
      </NavigationScreen>
      {confirmingRemoveFileType && (
        <ConfirmRemovingFileModal
          fileType={confirmingRemoveFileType}
          onConfirm={confirmRemoveFiles}
          onCancel={cancelConfirmingRemoveFiles}
        />
      )}
      {isConfirmingOfficial && (
        <Modal
          centerContent
          content={
            <Prose textCenter>
              <h1>Mark Unofficial Tally Results as Official Tally Results?</h1>
              <p>
                Have all CVR and external results files been loaded? Once
                results are marked as official, no additional CVR or external
                files can be loaded.
              </p>
              <p>Have all unofficial tally reports been reviewed?</p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button primary onPress={setOfficial}>
                Mark Tally Results as Official
              </Button>
              <Button onPress={cancelConfirmingOfficial}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={cancelConfirmingOfficial}
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
      {isExportResultsModalOpen && (
        <SaveFileToUsb
          onClose={() => setIsExportResultsModalOpen(false)}
          generateFileContent={generateSemsResults}
          defaultFilename={generateFinalExportDefaultFilename(
            isTestMode,
            electionDefinition.election
          )}
          fileType={FileType.Results}
          promptToEjectUsb
        />
      )}
    </React.Fragment>
  );
}
