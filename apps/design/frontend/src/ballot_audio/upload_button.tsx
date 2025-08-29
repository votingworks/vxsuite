import React from 'react';
import { useParams } from 'react-router-dom';

import { FileInputButton, Icons } from '@votingworks/ui';

import { assert } from '@votingworks/basics';
import * as api from '../api';
import { ElectionIdParams } from '../routes';

export interface UploadButtonProps {}

export function UploadButton(): JSX.Element {
  const [inProgress, setInProgress] = React.useState(false);
  const abortControlRef = React.useRef<AbortController>();

  const { electionId } = useParams<ElectionIdParams>();
  const uploadAudioFiles = api.uploadAudioFiles.useMutation().mutateAsync;

  // [TODO] Move to binary streaming API.
  const onAudioFilesSelect = React.useCallback(
    async (event: React.FormEvent<HTMLInputElement>) => {
      setInProgress(true);
      abortControlRef.current = new AbortController();

      const input = event.currentTarget;
      if (!input.files) return;

      const names: string[] = [];
      const dataUrls: string[] = [];

      let batchRoughSize = 0;
      for (const file of Array.from(input.files)) {
        if (abortControlRef.current?.signal.aborted) return;

        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();

          reader.addEventListener(
            'loadend',
            () => {
              assert(typeof reader.result === 'string');
              resolve(reader.result);
            },
            { once: true }
          );
          reader.addEventListener('error', (e) => reject(e.target?.error), {
            once: true,
          });

          reader.readAsDataURL(file);
        });

        const roughSize = dataUrl.length + file.name.length;

        // Grout size limit is 10mb - leaving some wiggle room for the extra
        // bloat from JSON syntax and field name chars:
        if (batchRoughSize + roughSize >= 9 * 1024 * 1024) {
          await uploadAudioFiles({ dataUrls, electionId, names });
          batchRoughSize = 0;
          dataUrls.length = 0;
          names.length = 0;
        }

        dataUrls.push(dataUrl);
        names.push(file.name);
        batchRoughSize += roughSize;
      }

      if (names.length) await uploadAudioFiles({ dataUrls, electionId, names });

      abortControlRef.current = undefined;
      setInProgress(false);
    },
    [electionId, uploadAudioFiles]
  );

  React.useEffect(() => () => abortControlRef.current?.abort(), []);

  return (
    <FileInputButton
      accept=".mp3"
      buttonProps={{ variant: inProgress ? 'neutral' : 'primary' }}
      multiple
      onChange={onAudioFilesSelect}
      disabled={inProgress}
    >
      {inProgress ? <Icons.Loading /> : <Icons.Import />} Upload Audio Files
    </FileInputButton>
  );
}
