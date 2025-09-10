import React from 'react';

import { FileInputButton, Icons } from '@votingworks/ui';

export interface UploadButtonProps {
  disabled?: boolean;
  label?: string;
  neutral?: boolean;
  onSelect: (files: File[]) => void;
}

export function UploadButton(props: UploadButtonProps): JSX.Element {
  const { disabled, label, neutral, onSelect } = props;
  const [inProgress, setInProgress] = React.useState(false);

  const onChange = React.useCallback(
    (event: React.FormEvent<HTMLInputElement>) => {
      setInProgress(true);

      const input = event.currentTarget;
      if (!input.files) return;

      onSelect(Array.from(input.files));
      setInProgress(false);
    },
    [onSelect]
  );

  return (
    <FileInputButton
      accept=".mp3"
      buttonProps={{ variant: inProgress || neutral ? 'neutral' : 'primary' }}
      multiple
      onChange={onChange}
      disabled={inProgress || disabled}
    >
      {inProgress ? <Icons.Loading /> : <Icons.Import />}{' '}
      {label || 'Upload Audio Files'}
    </FileInputButton>
  );
}
