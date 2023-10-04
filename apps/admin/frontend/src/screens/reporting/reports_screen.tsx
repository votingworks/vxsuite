import React, { useContext, useState, useEffect, useCallback } from 'react';
import pluralize from 'pluralize';

import {
  generateSemsFinalExportDefaultFilename,
  format,
  isElectionManagerAuth,
  getBallotCount,
} from '@votingworks/utils';
import {
  Button,
  useCancelablePromise,
  LinkButton,
  H2,
  P,
  Font,
} from '@votingworks/ui';
import { LogEventId } from '@votingworks/logging';

import { assert } from '@votingworks/basics';
import { AppContext } from '../../contexts/app_context';
import { MsSemsConverterClient } from '../../lib/converters/ms_sems_converter_client';

import { NavigationScreen } from '../../components/navigation_screen';
import { routerPaths } from '../../router_paths';
import {
  SaveFrontendFileModal,
  FileType,
} from '../../components/save_frontend_file_modal';
import { getTallyConverterClient } from '../../lib/converters';
import {
  getCardCounts,
  getCastVoteRecordFileMode,
  getSemsExportableTallies,
} from '../../api';
import { ExportBatchTallyResultsButton } from '../../components/export_batch_tally_results_button';

export function ReportsScreen(): JSX.Element {
  const makeCancelable = useCancelablePromise();

  const {
    electionDefinition,
    converter,
    isOfficialResults,
    configuredAt,
    logger,
    auth,
  } = useContext(AppContext);
  assert(isElectionManagerAuth(auth));
  const userRole = auth.user.role;
  assert(electionDefinition && typeof configuredAt === 'string');

  const cardCountsQuery = getCardCounts.useQuery();
  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const semsExportableTalliesQuery = getSemsExportableTallies.useQuery({
    enabled: converter === 'ms-sems',
  });

  const [isExportResultsModalOpen, setIsExportResultsModalOpen] =
    useState(false);

  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';

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

  const fileMode = castVoteRecordFileModeQuery.data;
  const totalBallotCount = cardCountsQuery.data
    ? getBallotCount(cardCountsQuery.data[0])
    : 0;

  const ballotCountSummaryText = cardCountsQuery.isSuccess ? (
    <P>
      <Font weight="bold">
        {format.count(totalBallotCount)}
        {fileMode === 'unlocked' ? ' ' : ` ${fileMode} `}
        {pluralize('ballot', totalBallotCount, false)}
      </Font>{' '}
      have been counted for{' '}
      <Font weight="bold">{electionDefinition.election.title}</Font>.
    </P>
  ) : (
    <P>Loading total ballot count...</P>
  );

  // saving results is enabled once a cast vote record file is loaded
  const canSaveResults =
    castVoteRecordFileModeQuery.isSuccess &&
    castVoteRecordFileModeQuery.data !== 'unlocked';

  return (
    <React.Fragment>
      <NavigationScreen title="Election Reports">
        <H2>{statusPrefix} Tally Reports</H2>
        <P>
          <LinkButton variant="primary" to={routerPaths.tallyFullReport}>
            Full Election Tally Report
          </LinkButton>
        </P>
        <P>
          <LinkButton to={routerPaths.tallyAllPrecinctsReport}>
            All Precincts Tally Report
          </LinkButton>{' '}
          <LinkButton to={routerPaths.tallySinglePrecinctReport}>
            Single Precinct Tally Report
          </LinkButton>
        </P>
        <P>
          <LinkButton to={routerPaths.tallyReportBuilder}>
            Tally Report Builder
          </LinkButton>
        </P>
        <H2>{statusPrefix} Ballot Count Reports</H2>
        {ballotCountSummaryText}
        <P>
          <LinkButton to={routerPaths.ballotCountReportPrecinct}>
            Precinct Ballot Count Report
          </LinkButton>{' '}
          <LinkButton to={routerPaths.ballotCountReportVotingMethod}>
            Voting Method Ballot Count Report
          </LinkButton>
        </P>
        <P>
          <LinkButton to={routerPaths.ballotCountReportBuilder}>
            Ballot Count Report Builder
          </LinkButton>
        </P>
        <H2>Other Reports</H2>
        <P>
          <LinkButton to={routerPaths.tallyWriteInReport}>
            {statusPrefix} Write-In Adjudication Report
          </LinkButton>
        </P>
        <P>
          <ExportBatchTallyResultsButton />{' '}
          {converterName !== '' && (
            <Button
              onPress={() => setIsExportResultsModalOpen(true)}
              disabled={
                !canSaveResults || !semsExportableTalliesQuery.isSuccess
              }
            >
              Save {converterName} Results
            </Button>
          )}
        </P>
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
