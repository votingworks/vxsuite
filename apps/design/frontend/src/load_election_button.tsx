import React, { FormEvent } from 'react';
import {
  Button,
  Callout,
  Caption,
  FileInputButton,
  Modal,
} from '@votingworks/ui';
import { useHistory } from 'react-router-dom';
import { assert } from '@votingworks/basics';
import { getUser, loadElection } from './api';
import { Column } from './layout';

export function LoadElectionButton({
  disabled,
}: {
  disabled: boolean;
}): JSX.Element | null {
  const history = useHistory();
  const loadElectionMutation = loadElection.useMutation();
  const getUserQuery = getUser.useQuery();
  assert(getUserQuery.isSuccess);
  const user = getUserQuery.data;

  async function onSelectElectionFile(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    assert(files.length === 1);
    const file = files[0];
    const electionData = await file.text();
    loadElectionMutation.mutate(
      { electionData, orgId: user.orgId },
      {
        onSuccess: (result) => {
          if (result.isOk()) {
            const electionId = result.ok();
            history.push(`/elections/${electionId}`);
          }
        },
      }
    );
  }

  return (
    <React.Fragment>
      <FileInputButton
        accept=".json"
        onChange={onSelectElectionFile}
        disabled={disabled || loadElectionMutation.isLoading}
      >
        Load Election
      </FileInputButton>
      {loadElectionMutation.isSuccess && loadElectionMutation.data.isErr() && (
        <Modal
          title="Error Loading Election"
          content={
            <Callout color="danger" icon="Danger">
              <Column style={{ gap: '0.5rem' }}>
                <strong>Invalid election file</strong>
                <div>
                  {loadElectionMutation.data
                    .err()
                    .message.split('\n')
                    .map((line) => (
                      <div key={line}>
                        <Caption>{line}</Caption>
                      </div>
                    ))}
                </div>
              </Column>
            </Callout>
          }
          actions={
            <Button onPress={() => loadElectionMutation.reset()}>Close</Button>
          }
          onOverlayClick={() => loadElectionMutation.reset()}
        />
      )}
    </React.Fragment>
  );
}
