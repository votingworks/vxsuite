import { Button } from '@votingworks/ui';
import { scanBatch } from '../api';

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
      disabled={disabled || !isScannerAttached}
      variant="primary"
      onPress={() => scanBatchMutation.mutate()}
    >
      {isScannerAttached ? 'Scan New Batch' : 'No Scanner'}
    </Button>
  );
}
