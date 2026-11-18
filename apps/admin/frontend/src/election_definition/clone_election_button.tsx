import React from 'react';
import { useHistory } from 'react-router-dom';
import { assertDefined } from '@votingworks/basics';
import { Button, Modal, P } from '@votingworks/ui';
import { routerPaths } from '../router_paths.js';
import { createInProgressElectionFromFile } from '../api.js';

interface CloneElectionButtonProps {
  readonly disabled?: boolean;
}

export function CloneElectionButton({
  disabled,
}: CloneElectionButtonProps): JSX.Element {
  const history = useHistory();
  const cloneMutation = createInProgressElectionFromFile.useMutation();

  async function onPress() {
    const dialogResult = await assertDefined(window.kiosk).showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '', extensions: ['zip', 'json'] }],
    });
    const [filePath] = dialogResult.filePaths;
    if (!filePath) return;
    cloneMutation.mutate(
      { filePath },
      {
        onSuccess: (result) => {
          if (result.isOk()) {
            history.push(routerPaths.electionDefinitionInfo(result.ok()));
          }
        },
      }
    );
  }

  const error = cloneMutation.data?.err();

  return (
    <React.Fragment>
      <Button disabled={disabled || cloneMutation.isLoading} onPress={onPress}>
        Clone Election
      </Button>
      {error && (
        <Modal
          title="Unable to Clone Election"
          content={<P>{error.message}</P>}
          actions={<Button onPress={cloneMutation.reset}>Close</Button>}
          onOverlayClick={cloneMutation.reset}
        />
      )}
    </React.Fragment>
  );
}
