import React, { useContext, useState } from 'react';

import { isElectionManagerAuth } from '@votingworks/utils';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { Button, Icons, H3 } from '@votingworks/ui';
import styled from 'styled-components';
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

const Section = styled.section`
  margin-bottom: 2rem;
`;

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

        <Section>
          <CastVoteRecordsTab />
        </Section>

        <Section>
          <ManualTalliesTab />
        </Section>
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
