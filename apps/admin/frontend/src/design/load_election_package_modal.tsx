import { useContext } from 'react';
import { useHistory } from 'react-router-dom';
import { useDesignRoutes } from '@votingworks/design-ui';
import { Button, Callout, Modal, P, Table, TD, TH } from '@votingworks/ui';
import { AppContext } from '../contexts/app_context.js';
import { listPotentialElectionPackagesOnUsbDrive } from '../api.js';
import { loadElectionPackage } from './design_api.js';

export function LoadElectionPackageModal({
  onClose,
}: {
  onClose: () => void;
}): JSX.Element {
  const history = useHistory();
  const routes = useDesignRoutes();
  const { usbDriveStatus } = useContext(AppContext);
  const filesQuery =
    listPotentialElectionPackagesOnUsbDrive.useQuery(usbDriveStatus);
  const loadMutation = loadElectionPackage.useMutation();

  function onSelect(electionFilePath: string) {
    loadMutation.mutate(
      { electionFilePath },
      {
        onSuccess: (result) => {
          if (result.isOk()) {
            history.push(routes.election(result.ok()).electionInfo.root.path);
          }
        },
      }
    );
  }

  const files = filesQuery.data?.ok();
  const loadError = loadMutation.data?.err();

  return (
    <Modal
      title="Load Election Package"
      content={
        <div>
          {loadError && (
            <Callout color="danger" icon="Danger">
              {loadError.message}
            </Callout>
          )}
          {!filesQuery.isSuccess ? null : !files ? (
            <P>Insert a USB drive containing an election package.</P>
          ) : files.length === 0 ? (
            <P>No election packages found on the inserted USB drive.</P>
          ) : (
            <Table>
              <thead>
                <tr>
                  <TH>File Name</TH>
                  <TH />
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.path}>
                    <TD>{file.name}</TD>
                    <TD>
                      <Button
                        onPress={() => onSelect(file.path)}
                        disabled={loadMutation.isLoading}
                      >
                        Load
                      </Button>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      }
      actions={
        <Button onPress={onClose} disabled={loadMutation.isLoading}>
          Cancel
        </Button>
      }
      onOverlayClick={onClose}
    />
  );
}
