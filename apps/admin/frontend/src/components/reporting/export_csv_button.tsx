import React, { useContext, useState } from 'react';
import { Button } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { Tabulation } from '@votingworks/types';
import path from 'path';
import { generateElectionBasedSubfolderName } from '@votingworks/utils';
import { AppContext } from '../../contexts/app_context';
import { exportTallyReportCsv, getCastVoteRecordFileMode } from '../../api';
import { SaveBackendFileModal } from '../save_backend_file_modal';
import {
  REPORT_SUBFOLDER,
  generateTallyReportCsvFilename,
} from '../../utils/reporting';

export function ExportCsvResultsButton({
  filter,
  groupBy,
  disabled,
}: {
  filter: Tabulation.Filter;
  groupBy: Tabulation.GroupBy;
  disabled?: boolean;
}): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [exportDate, setExportDate] = useState<Date>();

  function openModal() {
    setIsSaveModalOpen(true);
    setExportDate(new Date());
  }

  function closeModal() {
    setIsSaveModalOpen(false);
    setExportDate(undefined);
  }

  const exportResultsCsvMutation = exportTallyReportCsv.useMutation();
  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const isTestMode = castVoteRecordFileModeQuery.data === 'test';

  const defaultFilename = generateTallyReportCsvFilename({
    election,
    filter,
    groupBy,
    isTestMode,
    time: exportDate,
  });
  const defaultFilePath = path.join(
    generateElectionBasedSubfolderName(
      electionDefinition.election,
      electionDefinition.electionHash
    ),
    REPORT_SUBFOLDER,
    defaultFilename
  );

  return (
    <React.Fragment>
      <Button disabled={disabled} onPress={openModal}>
        Export CSV Results
      </Button>
      {isSaveModalOpen && (
        <SaveBackendFileModal
          saveFileStatus={exportResultsCsvMutation.status}
          saveFile={({ path: savePath }) =>
            exportResultsCsvMutation.mutate({
              path: savePath,
              filter,
              groupBy,
            })
          }
          saveFileResult={exportResultsCsvMutation.data}
          resetSaveFileResult={exportResultsCsvMutation.reset}
          onClose={closeModal}
          fileType="results"
          fileTypeTitle="Results"
          defaultRelativePath={defaultFilePath}
        />
      )}
    </React.Fragment>
  );
}
