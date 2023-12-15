import React, { useContext } from 'react';
import styled from 'styled-components';
import moment from 'moment';
import {
  Button,
  Card,
  FullScreenMessage,
  H2,
  Icons,
  Table,
  UsbDriveImage,
} from '@votingworks/ui';
import type { FileSystemEntry } from '@votingworks/backend';
import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import { Election } from '@votingworks/types';
import { Loading } from '../components/loading';
import { NavigationScreen } from '../components/navigation_screen';
import { configure, listPotentialElectionPackagesOnUsbDrive } from '../api';
import { AppContext } from '../contexts/app_context';
import { TIME_FORMAT } from '../config/globals';
import { ElectionCard } from '../components/election_card';

const ButtonRow = styled.tr`
  cursor: pointer;

  & td {
    padding: 0.75rem 0.5rem;
  }

  &:hover {
    background-color: ${(p) => p.theme.colors.containerLow};
  }
`;

function SelectElectionPackage({
  potentialElectionPackageFiles,
}: {
  potentialElectionPackageFiles: Array<{
    file: FileSystemEntry;
    election: Election;
  }>;
}): JSX.Element {
  const configureMutation = configure.useMutation();

  async function onSelectOtherFile() {
    const dialogResult = await assertDefined(window.kiosk).showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '', extensions: ['zip', 'json'] }],
    });
    if (dialogResult.canceled) return;
    const selectedPath = dialogResult.filePaths[0];
    if (selectedPath) {
      configureMutation.mutate({ electionFilePath: selectedPath });
    }
  }

  const configureError = configureMutation.data?.err();

  return (
    <React.Fragment>
      <H2>Select an election package to configure VxAdmin</H2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {configureError && (
          <Card color="danger">
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Icons.Danger color="danger" />
              {(() => {
                switch (configureError.type) {
                  case 'invalid-zip':
                    return 'Invalid election package zip file.';
                  case 'invalid-election':
                    return 'Invalid election definition file.';
                  case 'invalid-system-settings':
                    return 'Invalid system settings file.';
                  default:
                    /* istanbul ignore next */
                    return throwIllegalValue(configureError.type);
                }
              })()}
            </div>
          </Card>
        )}
        {potentialElectionPackageFiles.length === 0 ? (
          <Card color="neutral">
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Icons.Info />
              No election packages found on the inserted USB drive.
            </div>
          </Card>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>File Name</th>
                <th>Created At</th>
                <th>Election</th>
              </tr>
            </thead>
            <tbody>
              {potentialElectionPackageFiles.map(({ file, election }) => (
                <ButtonRow
                  key={file.name}
                  aria-disabled={configureMutation.isLoading}
                  onClick={() => {
                    if (configureMutation.isLoading) return;
                    configureMutation.mutate({ electionFilePath: file.path });
                  }}
                >
                  <td>{file.name}</td>
                  <td>{moment(file.ctime).format(TIME_FORMAT)}</td>
                  <td>
                    <ElectionCard election={election} />
                  </td>
                </ButtonRow>
              ))}
            </tbody>
          </Table>
        )}
        <div>
          <Button
            disabled={configureMutation.isLoading}
            onPress={onSelectOtherFile}
          >
            Select Other File...
          </Button>
        </div>
      </div>
    </React.Fragment>
  );
}

export function UnconfiguredScreen(): JSX.Element {
  const { usbDriveStatus } = useContext(AppContext);
  const listPotentialElectionPackagesOnUsbDriveQuery =
    listPotentialElectionPackagesOnUsbDrive.useQuery(usbDriveStatus);

  if (!listPotentialElectionPackagesOnUsbDriveQuery.isSuccess) {
    return (
      <NavigationScreen>
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  const potentialElectionPackagesResult =
    listPotentialElectionPackagesOnUsbDriveQuery.data;

  return (
    <NavigationScreen title="Election">
      {potentialElectionPackagesResult.isErr() ? (
        <FullScreenMessage
          title="Insert a USB drive containing an election package"
          image={<UsbDriveImage />}
        />
      ) : (
        <SelectElectionPackage
          potentialElectionPackageFiles={potentialElectionPackagesResult.ok()}
        />
      )}
    </NavigationScreen>
  );
}
