import React, { useContext, useState } from 'react';

import { isElectionManagerAuth } from '@votingworks/utils';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { Button, Icons, H3, RouterTabBar } from '@votingworks/ui';
import { Redirect, Route, Switch } from 'react-router-dom';
import { ResultsFileType } from '../../config/types';

import { AppContext } from '../../contexts/app_context';

import { NavigationScreen } from '../../components/navigation_screen';
import { ConfirmRemovingFileModal } from './confirm_removing_file_modal';
import {
  clearCastVoteRecordFiles,
  deleteAllManualResults,
  getCastVoteRecordFileMode,
  getCastVoteRecordFiles,
  getManualResultsMetadata,
} from '../../api';
import { Loading } from '../../components/loading';
import { OfficialResultsCard } from '../../components/official_results_card';
import { CastVoteRecordsTab } from './cast_vote_records_tab';
import { ManualTalliesTab } from './manual_tallies_tab';
import { routerPaths } from '../../router_paths';

export function TallyScreen(): JSX.Element | null {
  const { electionDefinition, isOfficialResults, auth } =
    useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth));

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

  const castVoteRecordFileList = castVoteRecordFilesQuery.data;
  const hasAnyFiles = castVoteRecordFileList.length > 0 || hasManualTally;

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

        <RouterTabBar
          tabs={[
            {
              title: 'Cast Vote Records (CVRs)',
              path: routerPaths.tallyCvrs,
            },
            {
              title: 'Manual Tallies',
              path: routerPaths.tallyManual,
            },
          ]}
        />

        <Switch>
          <Route
            exact
            path={routerPaths.tallyCvrs}
            component={CastVoteRecordsTab}
          />
          <Route
            exact
            path={routerPaths.tallyManual}
            component={ManualTalliesTab}
          />
          <Redirect from={routerPaths.tally} to={routerPaths.tallyCvrs} />
        </Switch>
      </NavigationScreen>
      {confirmingRemoveFileType && (
        <ConfirmRemovingFileModal
          fileType={confirmingRemoveFileType}
          onConfirm={confirmRemoveFiles}
          onCancel={cancelConfirmingRemoveFiles}
        />
      )}
    </React.Fragment>
  );
}
