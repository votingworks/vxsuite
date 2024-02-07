import React, { useContext, useState } from 'react';
import { Button } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import path from 'path';
import { generateElectionBasedSubfolderName } from '@votingworks/utils';
import { AppContext } from '../../contexts/app_context';
import {
  exportWriteInAdjudicationReportPdf,
  getCastVoteRecordFileMode,
} from '../../api';
import { SaveBackendFileModal } from '../save_backend_file_modal';
import {
  REPORT_SUBFOLDER,
  generateReportFilename,
} from '../../utils/reporting';

export function ExportWriteInAdjudicationReportPdfButton({
  disabled,
}: {
  disabled?: boolean;
}): JSX.Element {
  const { electionDefinition, isOfficialResults } = useContext(AppContext);
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

  const exportMutation = exportWriteInAdjudicationReportPdf.useMutation();
  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const isTestMode = castVoteRecordFileModeQuery.data === 'test';

  const defaultFilename = generateReportFilename({
    election,
    filter: {},
    groupBy: {},
    type: 'write-in-adjudication-report',
    isTestMode,
    isOfficialResults,
    extension: 'pdf',
    time: exportDate ?? new Date(),
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
        Export Report PDF
      </Button>
      {isSaveModalOpen && (
        <SaveBackendFileModal
          saveFileStatus={exportMutation.status}
          saveFile={({ path: savePath }) =>
            exportMutation.mutate({
              path: savePath,
            })
          }
          saveFileResult={exportMutation.data}
          resetSaveFileResult={exportMutation.reset}
          onClose={closeModal}
          fileType="write-in adjudication report"
          fileTypeTitle="Write-In Adjudication Report"
          defaultRelativePath={defaultFilePath}
        />
      )}
    </React.Fragment>
  );
}
