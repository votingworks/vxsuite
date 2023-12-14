import React, { useContext, useState } from 'react';
import { Button } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import path from 'path';
import { generateElectionBasedSubfolderName } from '@votingworks/utils';
import { AppContext } from '../../contexts/app_context';
import {
  exportCdfElectionResultsReport,
  getCastVoteRecordFileMode,
} from '../../api';
import { SaveBackendFileModal } from '../save_backend_file_modal';
import {
  REPORT_SUBFOLDER,
  generateCdfElectionResultsReportFilename,
} from '../../utils/reporting';

export function ExportCdfElectionResultsReportButton({
  disabled,
}: {
  disabled?: boolean;
}): JSX.Element {
  const { electionDefinition, isOfficialResults } = useContext(AppContext);
  assert(electionDefinition);

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

  const exportCdfElectionResultsReportMutation =
    exportCdfElectionResultsReport.useMutation();
  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const isTestMode = castVoteRecordFileModeQuery.data === 'test';

  const defaultFilename = generateCdfElectionResultsReportFilename({
    isTestMode,
    isOfficialResults,
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
        Export CDF Report
      </Button>
      {isSaveModalOpen && (
        <SaveBackendFileModal
          saveFileStatus={exportCdfElectionResultsReportMutation.status}
          saveFile={({ path: savePath }) =>
            exportCdfElectionResultsReportMutation.mutate({
              path: savePath,
            })
          }
          saveFileResult={exportCdfElectionResultsReportMutation.data}
          resetSaveFileResult={exportCdfElectionResultsReportMutation.reset}
          onClose={closeModal}
          fileType="CDF election results report"
          fileTypeTitle="CDF Election Results Report"
          defaultRelativePath={defaultFilePath}
        />
      )}
    </React.Fragment>
  );
}
