import { Button } from '@votingworks/ui';
import { scanBatch } from '../api.js';

export interface Props {
  disabled?: boolean;
  isScannerAttached: boolean;
}

export function ScanButton({
  disabled,
  isScannerAttached,
}: Props): JSX.Element {
  const scanBatchMutation = scanBatch.useMutation();

  return (
    <Button
      icon={isScannerAttached ? 'Add' : 'Closed'}
      disabled={disabled || !isScannerAttached || scanBatchMutation.isLoading}
      variant="primary"
      onPress={() => scanBatchMutation.mutate()}
    >
      {isScannerAttached ? 'Scan New Batch' : 'No Scanner'}
    </Button>
  );
}
