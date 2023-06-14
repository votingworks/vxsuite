import React, { useContext, useState, useEffect, useCallback } from 'react';
import pluralize from 'pluralize';

import {
  canDistinguishVotingMethods,
  generateSemsFinalExportDefaultFilename,
  format,
  isElectionManagerAuth,
} from '@votingworks/utils';
import {
  Button,
  Prose,
  useCancelablePromise,
  LinkButton,
} from '@votingworks/ui';
import { TallyCategory } from '@votingworks/types';
import { LogEventId } from '@votingworks/logging';

import { assert } from '@votingworks/basics';
import { AppContext } from '../contexts/app_context';
import { MsSemsConverterClient } from '../lib/converters/ms_sems_converter_client';

import { Loading } from '../components/loading';
import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';
import { BallotCountsTable } from '../components/ballot_counts_table';
import { getPartiesWithPrimaryElections } from '../utils/election';
import {
  SaveFrontendFileModal,
  FileType,
} from '../components/save_frontend_file_modal';
import { getTallyConverterClient } from '../lib/converters';
import { SaveResultsButton } from '../components/save_results_button';
import { getCastVoteRecordFileMode, getSemsExportableTallies } from '../api';

export function ReportsScreen(): JSX.Element {
  const makeCancelable = useCancelablePromise();

  const {
    electionDefinition,
    converter,
    isOfficialResults,
    isTabulationRunning,
    fullElectionTally,
    fullElectionManualTally,
    configuredAt,
    logger,
    auth,
  } = useContext(AppContext);
  assert(isElectionManagerAuth(auth));
  const userRole = auth.user.role;
  assert(electionDefinition && typeof configuredAt === 'string');
  const { election } = electionDefinition;

  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const semsExportableTalliesQuery = getSemsExportableTallies.useQuery({
    enabled: converter === 'ms-sems',
  });

  const [isExportResultsModalOpen, setIsExportResultsModalOpen] =
    useState(false);

  const [isShowingBatchResults, setIsShowingBatchResults] = useState(false);
  const toggleShowingBatchResults = useCallback(() => {
    setIsShowingBatchResults(!isShowingBatchResults);
  }, [isShowingBatchResults, setIsShowingBatchResults]);

  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';

  const partiesForPrimaries = getPartiesWithPrimaryElections(election);

  const totalBallotCountInternal =
    fullElectionTally?.overallTally.numberOfBallotsCounted ?? 0;
  const totalBallotCountManual =
    fullElectionManualTally?.overallTally.numberOfBallotsCounted ?? 0;
  const totalBallotCount = totalBallotCountInternal + totalBallotCountManual;

  const [converterName, setConverterName] = useState('');
  useEffect(() => {
    void (async () => {
      try {
        const client = getTallyConverterClient(converter);
        if (client) {
          await makeCancelable(client.getFiles());
          setConverterName(client.getDisplayName());
        }
      } catch {
        setConverterName('');
      }
    })();
  }, [converter, makeCancelable]);

  const generateSemsResults = useCallback(async (): Promise<string> => {
    await logger.log(LogEventId.ConvertingResultsToSemsFormat, userRole);
    assert(semsExportableTalliesQuery.isSuccess);

    // process on the server
    const client = new MsSemsConverterClient('tallies');
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
      new File([JSON.stringify(semsExportableTalliesQuery.data)], 'tallies')
    );
    await client.process();

    // save the result
    const results = await client.getOutputFile(resultsFile.name);

    // reset files on the server
    await client.reset();
    return await results.text();
  }, [
    electionDefinition.electionData,
    logger,
    semsExportableTalliesQuery,
    userRole,
  ]);

  let tallyResultsInfo = <Loading>Tabulating Results…</Loading>;
  if (!isTabulationRunning) {
    const resultTables = (
      <React.Fragment>
        <h2>Tally Report by Precinct</h2>
        <BallotCountsTable breakdownCategory={TallyCategory.Precinct} />
        {canDistinguishVotingMethods(election) && (
          <React.Fragment>
            <h2>Tally Report by Voting Method</h2>
            <BallotCountsTable breakdownCategory={TallyCategory.VotingMethod} />
          </React.Fragment>
        )}
        {partiesForPrimaries.length > 0 && (
          <React.Fragment>
            <h2>Tally Report by Party</h2>
            <BallotCountsTable breakdownCategory={TallyCategory.Party} />
          </React.Fragment>
        )}
        <h2>Tally Report by Scanner</h2>
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

    tallyResultsInfo = resultTables;
  }

  const fileMode = castVoteRecordFileModeQuery.data;
  const ballotCountSummaryText = (
    <p>
      <strong>
        {format.count(totalBallotCount)}
        {fileMode === 'unlocked' ? ' ' : ` ${fileMode} `}
        {pluralize('ballot', totalBallotCount, false)}{' '}
      </strong>{' '}
      have been counted for <strong>{electionDefinition.election.title}</strong>
      .
    </p>
  );

  // saving results is enabled once a cast vote record file is loaded
  const canSaveResults =
    castVoteRecordFileModeQuery.isSuccess &&
    castVoteRecordFileModeQuery.data !== 'unlocked';

  return (
    <React.Fragment>
      <NavigationScreen title="Election Reports">
        <Prose maxWidth={false}>
          {ballotCountSummaryText}
          <p>
            <LinkButton primary to={routerPaths.tallyFullReport}>
              {statusPrefix} Full Election Tally Report
            </LinkButton>{' '}
            {converterName !== '' && (
              <React.Fragment>
                <Button
                  onPress={() => setIsExportResultsModalOpen(true)}
                  disabled={
                    !canSaveResults || !semsExportableTalliesQuery.isSuccess
                  }
                >
                  Save {converterName} Results
                </Button>{' '}
              </React.Fragment>
            )}
            <SaveResultsButton disabled={!canSaveResults} />
          </p>
          <p>
            <LinkButton to={routerPaths.tallyWriteInReport}>
              {statusPrefix} Write-In Tally Report
            </LinkButton>
          </p>
          {tallyResultsInfo}
        </Prose>
      </NavigationScreen>
      {isExportResultsModalOpen && (
        <SaveFrontendFileModal
          onClose={() => setIsExportResultsModalOpen(false)}
          generateFileContent={generateSemsResults}
          defaultFilename={generateSemsFinalExportDefaultFilename(
            fileMode === 'test',
            electionDefinition.election
          )}
          fileType={FileType.Results}
          promptToEjectUsb
        />
      )}
    </React.Fragment>
  );
}
