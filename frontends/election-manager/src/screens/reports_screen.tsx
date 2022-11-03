import React, { useContext, useState, useEffect, useCallback } from 'react';
import pluralize from 'pluralize';

import {
  assert,
  canDistinguishVotingMethods,
  generateSemsFinalExportDefaultFilename,
  format,
} from '@votingworks/utils';
import {
  Button,
  Prose,
  useCancelablePromise,
  isElectionManagerAuth,
} from '@votingworks/ui';
import { TallyCategory } from '@votingworks/types';
import { LogEventId } from '@votingworks/logging';

import { Admin } from '@votingworks/api';
import { AppContext } from '../contexts/app_context';
import { MsSemsConverterClient } from '../lib/converters/ms_sems_converter_client';

import { Loading } from '../components/loading';
import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';
import { LinkButton } from '../components/link_button';
import { BallotCountsTable } from '../components/ballot_counts_table';
import { getPartiesWithPrimaryElections } from '../utils/election';
import { SaveFileToUsb, FileType } from '../components/save_file_to_usb';
import { getTallyConverterClient } from '../lib/converters';
import { SaveResultsButton } from '../components/save_results_button';
import { usePrintedBallotsQuery } from '../hooks/use_printed_ballots_query';
import { useCvrFileModeQuery } from '../hooks/use_cvr_file_mode_query';

export function ReportsScreen(): JSX.Element {
  const makeCancelable = useCancelablePromise();

  const {
    castVoteRecordFiles,
    electionDefinition,
    converter,
    isOfficialResults,
    isTabulationRunning,
    generateExportableTallies,
    fullElectionTally,
    fullElectionExternalTallies,
    configuredAt,
    logger,
    auth,
  } = useContext(AppContext);
  const printedBallotsQuery = usePrintedBallotsQuery({
    ballotMode: Admin.BallotMode.Official,
  });
  const printedBallots = printedBallotsQuery.data ?? [];
  assert(isElectionManagerAuth(auth));
  const userRole = auth.user.role;
  assert(electionDefinition && typeof configuredAt === 'string');
  const { election } = electionDefinition;

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
  const totalBallotCountExternal = Array.from(
    fullElectionExternalTallies.values()
  ).reduce(
    (prev, tally) => prev + tally.overallTally.numberOfBallotsCounted,
    0
  );
  const totalBallotCount = totalBallotCountInternal + totalBallotCountExternal;

  const totalBallotsPrinted = printedBallots.reduce(
    (count, ballot) => count + ballot.numCopies,
    0
  );

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
    const exportableTallies = generateExportableTallies();
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
      new File([JSON.stringify(exportableTallies)], 'tallies')
    );
    await client.process();

    // save the result
    const results = await client.getOutputFile(resultsFile.name);

    // reset files on the server
    await client.reset();
    return await results.text();
  }, [
    electionDefinition.electionData,
    generateExportableTallies,
    logger,
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

  const fileMode = useCvrFileModeQuery().data;
  const ballotCountSummaryText = (
    <p>
      <strong>
        {format.count(totalBallotCount)}
        {fileMode === Admin.CvrFileMode.Unlocked ? ' ' : ` ${fileMode} `}
        {pluralize('ballot', totalBallotCount, false)}{' '}
      </strong>{' '}
      have been counted for <strong>{electionDefinition.election.title}</strong>
      .
    </p>
  );

  return (
    <React.Fragment>
      <NavigationScreen>
        <Prose maxWidth={false}>
          <h1>Election Reports</h1>
          {ballotCountSummaryText}
          <p>
            <LinkButton primary to={routerPaths.tallyFullReport}>
              {statusPrefix} Full Election Tally Report
            </LinkButton>{' '}
            {castVoteRecordFiles.wereAdded && (
              <React.Fragment>
                {converterName !== '' && (
                  <React.Fragment>
                    <Button onPress={() => setIsExportResultsModalOpen(true)}>
                      Save {converterName} Results
                    </Button>{' '}
                  </React.Fragment>
                )}
                <SaveResultsButton />
              </React.Fragment>
            )}
          </p>
          <p>
            <LinkButton to={routerPaths.printedBallotsReport}>
              Printed Ballots Report
            </LinkButton>
            <span
              style={{ marginLeft: '1em' }}
              data-testid="printed-ballots-summary"
            >
              <strong>
                {pluralize(
                  `${format.count(totalBallotsPrinted)} ballots`,
                  totalBallotsPrinted
                )}
              </strong>{' '}
              {`${pluralize('have', totalBallotsPrinted)} been printed`}.
            </span>
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
        <SaveFileToUsb
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
