import React from 'react';

import { FileInputButton, Icons } from '@votingworks/ui';

export interface UploadButtonProps {
  onSelect: (files: File[]) => void;
}

export function UploadButton(props: UploadButtonProps): JSX.Element {
  const { onSelect } = props;
  const [inProgress, setInProgress] = React.useState(false);

  const onChange = React.useCallback(
    (event: React.FormEvent<HTMLInputElement>) => {
      setInProgress(true);

      const input = event.currentTarget;
      if (!input.files) return;

      onSelect(Array.from(input.files));
    },
    [onSelect]
  );

  return (
    <FileInputButton
      accept=".mp3"
      buttonProps={{ variant: inProgress ? 'neutral' : 'primary' }}
      multiple
      onChange={onChange}
      disabled={inProgress}
    >
      {inProgress ? <Icons.Loading /> : <Icons.Import />} Upload Audio Files
    </FileInputButton>
  );
}
