import { Button } from '@votingworks/ui';
import { scanBatch } from '../api';

export interface Props {
  disabled?: boolean;
  label?: string;
}

export function ScanButton({
  disabled,
  label = 'Scan New Batch',
}: Props): JSX.Element {
  const scanBatchMutation = scanBatch.useMutation();

  return (
    <Button
      icon="Add"
      disabled={disabled || scanBatchMutation.isLoading}
      variant="primary"
      onPress={() => scanBatchMutation.mutate()}
    >
      {label}
    </Button>
  );
}
