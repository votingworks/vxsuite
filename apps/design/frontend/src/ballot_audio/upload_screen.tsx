/* eslint-disable @typescript-eslint/no-use-before-define */
import React from 'react';
import { useParams } from 'react-router-dom';

import { Button, Icons, Table, TD, TH } from '@votingworks/ui';

import { assert } from '@votingworks/basics';
import styled from 'styled-components';
import { AudioUploadResult } from '@votingworks/design-backend';
import * as api from '../api';
import { ElectionIdParams } from '../routes';

export interface UploadScreenProps {
  files: File[];
  onDone: () => void;
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Body = styled.div`
  flex-grow: 1;
  overflow-y: auto;
`;

const ButtonBar = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: end;
  padding-top: 1rem;
`;

const Td = styled(TD)`
  padding: 0.75rem 0.5rem !important;
`;

const Th = styled(TH)`
  padding: 0.75rem 0.5rem !important;
`;

interface Batch {
  names: string[];
  result?: AudioUploadResult[];
  task: Promise<AudioUploadResult[]>;
}

export function UploadScreen(props: UploadScreenProps): JSX.Element {
  const { files, onDone } = props;

  const [inProgress, setInProgress] = React.useState(false);

  const abortControlRef = React.useRef<AbortController>();
  const batches = React.useRef<Batch[]>([]);

  const { electionId } = useParams<ElectionIdParams>();
  const uploadAudioFiles = api.uploadAudioFiles.useMutation().mutateAsync;

  const upload = React.useCallback(async () => {
    setInProgress(true);
    abortControlRef.current = new AbortController();

    let names: string[] = [];
    let dataUrls: string[] = [];
    const tasks: Array<Promise<AudioUploadResult[]>> = [];

    let batchRoughSize = 0;
    for (const file of files) {
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
        const task = uploadAudioFiles({ dataUrls, electionId, names });
        tasks.push(task);

        const batch: Batch = { names, task };
        batches.current.push(batch);
        void task.then((result) => {
          batch.result = result;
        });

        batchRoughSize = 0;
        dataUrls = [];
        names = [];
      }

      dataUrls.push(dataUrl);
      names.push(file.name);
      batchRoughSize += roughSize;
    }

    if (names.length) {
      const task = uploadAudioFiles({ dataUrls, electionId, names });
      tasks.push(task);

      const batch: Batch = { names, task };
      batches.current.push(batch);
      void task.then((result) => {
        batch.result = result;
      });
    }

    await Promise.all(tasks);

    abortControlRef.current = undefined;
    setInProgress(false);
  }, [electionId, files, uploadAudioFiles]);

  React.useEffect(() => {
    // Delay upload to work around weird double rendering issue seemingly
    // originating from the app root.
    const timer = window.setTimeout(() => {
      if (abortControlRef.current?.signal.aborted) return;
      void upload();
    }, 100);

    return () => {
      window.clearTimeout(timer);
      batches.current = [];
      abortControlRef.current?.abort();
    };
  }, [upload]);

  return (
    <Container>
      <Body>
        <Table>
          <thead>
            <tr>
              <Th />
              <Th>File</Th>
              <Th>Matched Contest</Th>
              <Th>Matched Candidate</Th>
            </tr>
          </thead>
          <tbody>
            {batches.current.map((b, ixBatch) =>
              b.names.map((name, ixFile) => {
                const pending = !b.result;
                const match = b.result?.[ixFile];

                if (!pending && !match?.contestId) return;

                return (
                  // eslint-disable-next-line react/no-array-index-key
                  <tr key={`${ixBatch}-${name}`}>
                    <Td textAlign="center">
                      {pending ? (
                        <Icons.Loading />
                      ) : match?.contestId ? (
                        <Icons.Done color="success" />
                      ) : (
                        <Icons.Warning />
                      )}
                    </Td>
                    <Td>{name}</Td>
                    {match ? (
                      <AudioMatchCells {...match} />
                    ) : (
                      <React.Fragment>
                        <Td />
                        <Td />
                      </React.Fragment>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </Body>
      <ButtonBar>
        <Button
          disabled={inProgress}
          icon={inProgress ? 'Loading' : 'Done'}
          onPress={onDone}
          variant={inProgress ? 'neutral' : 'primary'}
        >
          {inProgress ? 'Uploading...' : 'Done'}
        </Button>
      </ButtonBar>
    </Container>
  );
}

function AudioMatchCells(props: AudioUploadResult) {
  const { candidateId, contestId } = props;
  const { electionId } = useParams<ElectionIdParams>();

  const contests = api.listContests.useQuery(electionId).data;
  if (!contests) {
    return (
      <React.Fragment>
        <Td />
        <Td />
      </React.Fragment>
    );
  }

  let candidateName: string = '';
  let contestTitle: string = '';

  for (const contest of contests) {
    if (contest.id !== contestId) continue;
    contestTitle = contest.title;

    if (contest.type !== 'candidate') continue;

    for (const candidate of contest.candidates) {
      if (candidate.id !== candidateId) continue;
      candidateName = candidate.name;
    }
  }

  return (
    <React.Fragment>
      <Td>{contestTitle}</Td>
      <Td>{candidateName}</Td>
    </React.Fragment>
  );
}
