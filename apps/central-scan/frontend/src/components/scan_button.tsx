import { Button } from '@votingworks/ui';

export interface Props {
  onPress(): void;
  disabled?: boolean;
  isScannerAttached: boolean;
}

export function ScanButton({
  onPress,
  disabled,
  isScannerAttached,
}: Props): JSX.Element {
  return (
    <Button
      small
      disabled={disabled || !isScannerAttached}
      variant="primary"
      onPress={onPress}
    >
      {isScannerAttached ? 'Scan New Batch' : 'No Scanner'}
    </Button>
  );
}
