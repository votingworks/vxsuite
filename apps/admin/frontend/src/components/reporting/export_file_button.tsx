import React, { useContext, useState } from 'react';
import { Button } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { UseMutationResult } from '@tanstack/react-query';
import type { ExportDataResult } from '@votingworks/admin-backend';
import { Election } from '@votingworks/types';
import { AppContext } from '../../contexts/app_context';
import { getCastVoteRecordFileMode } from '../../api';
import { SaveBackendFileModal } from '../save_backend_file_modal';

export function ExportFileButton<T extends { [key: string]: unknown }>({
  buttonText,
  exportMutation,
  exportParameters,
  generateFilename,
  fileType,
  fileTypeTitle,
  disabled,
}: {
  buttonText: string;
  exportMutation: UseMutationResult<
    ExportDataResult,
    unknown,
    T & { filename: string },
    unknown
  >;
  exportParameters: T;
  generateFilename: (props: {
    election: Election;
    isTestMode: boolean;
    isOfficialResults: boolean;
    time: Date;
  }) => string;
  fileType: string;
  fileTypeTitle: string;
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

  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const isTestMode = castVoteRecordFileModeQuery.data === 'test';

  const filename = generateFilename({
    election,
    isTestMode,
    isOfficialResults,
    time: exportDate ?? new Date(),
  });

  return (
    <React.Fragment>
      <Button disabled={disabled} onPress={openModal}>
        {buttonText}
      </Button>
      {isSaveModalOpen && (
        <SaveBackendFileModal
          saveFileStatus={exportMutation.status}
          saveFile={({ filename: saveFilename }) =>
            exportMutation.mutate({
              filename: saveFilename,
              // eslint-disable-next-line vx/gts-spread-like-types
              ...exportParameters,
            })
          }
          saveFileResult={exportMutation.data}
          resetSaveFileResult={exportMutation.reset}
          onClose={closeModal}
          fileType={fileType}
          fileTypeTitle={fileTypeTitle}
          filename={filename}
        />
      )}
    </React.Fragment>
  );
}
