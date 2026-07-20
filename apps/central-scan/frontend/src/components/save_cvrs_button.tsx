import { useState } from 'react';
import React from 'react';
import { Button } from '@votingworks/ui';
import { ExportResultsModal } from './export_results_modal';
import { getStatus } from '../api';

export function SaveCvrsButton(): JSX.Element | null {
  const statusQuery = getStatus.useQuery();
  const [isExportingCvrs, setIsExportingCvrs] = useState(false);

  if (!statusQuery.isSuccess) {
    return null;
  }
  const status = statusQuery.data;
  const isBatchOpen = !!status.currentBatch;
  const savedBatches = status.batches.filter(
    (b) => b.id !== status.currentBatch?.batchId
  );

  let exportButtonTitle;
  if (status.adjudicationsRemaining > 0) {
    exportButtonTitle =
      'You cannot save results until all sheets have been adjudicated.';
  } else if (isBatchOpen) {
    exportButtonTitle = 'You cannot save results while a batch is in progress.';
  } else if (savedBatches.length === 0) {
    exportButtonTitle =
      'You cannot save results until you have scanned at least one sheet.';
  }

  return (
    <React.Fragment>
      <Button
        onPress={() => setIsExportingCvrs(true)}
        disabled={
          status.adjudicationsRemaining > 0 ||
          isBatchOpen ||
          savedBatches.length === 0
        }
        nonAccessibleTitle={exportButtonTitle}
        icon="Export"
      >
        Save CVRs
      </Button>
      {isExportingCvrs && (
        <ExportResultsModal onClose={() => setIsExportingCvrs(false)} />
      )}
    </React.Fragment>
  );
}
