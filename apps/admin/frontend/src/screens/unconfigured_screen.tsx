import React, { useContext } from 'react';
import styled from 'styled-components';
import { DateTime } from 'luxon';
import {
  Button,
  Card,
  FullScreenMessage,
  H2,
  Icons,
  Loading,
  LoadingButton,
  Table,
  UsbDriveImage,
} from '@votingworks/ui';
import type { FileSystemEntry } from '@votingworks/fs';
import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import { systemLimitViolationToString } from '@votingworks/utils';
import { NavigationScreen } from '../components/navigation_screen.js';
import { configure, listPotentialElectionPackagesOnUsbDrive } from '../api.js';
import { AppContext } from '../contexts/app_context.js';
import { TIME_FORMAT } from '../config/globals.js';

const Heading = styled(H2)`
  margin-bottom: 1rem;
`;

const ButtonRow = styled.tr`
  cursor: pointer;

  & td {
    padding: 0.75rem 0.5rem;
  }

  &:hover {
    background-color: ${(p) => p.theme.colors.containerLow};
  }

  &[aria-disabled='true'] {
    cursor: not-allowed;
  }
`;

const LoadingIndicator = styled.td`
  min-width: 10rem;

  span {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
`;

type Source = { type: 'menu'; filePath: string } | { type: 'file-picker' };

function SelectElectionPackage({
  potentialElectionPackageFiles,
}: {
  potentialElectionPackageFiles: FileSystemEntry[];
}): JSX.Element {
  const configureMutation = configure.useMutation();
  const [source, setSource] = React.useState<Source>();

  async function onSelectOtherFile() {
    const dialogResult = await assertDefined(window.kiosk).showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: '',
          extensions:
            process.env.NODE_ENV === 'development' ? ['zip', 'json'] : ['zip'],
        },
      ],
    });
    if (dialogResult.canceled) return;
    const selectedPath = dialogResult.filePaths[0];
    if (selectedPath) {
      setSource({ type: 'file-picker' });
      configureMutation.mutate({ electionFilePath: selectedPath });
    }
  }

  const configureError = configureMutation.data?.err();

  return (
    <React.Fragment>
      <Heading>Select an election package to configure VxAdmin</Heading>
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
                  case 'invalid-metadata':
                    return 'Invalid metadata file.';
                  case 'system-limit-violation':
                    return systemLimitViolationToString(
                      configureError.violation
                    );
                  default: {
                    /* istanbul ignore next */
                    throwIllegalValue(configureError, 'type');
                  }
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
                <th />
              </tr>
            </thead>
            <tbody>
              {potentialElectionPackageFiles.map((file) => (
                <ButtonRow
                  key={file.name}
                  aria-disabled={configureMutation.isLoading}
                  onClick={() => {
                    if (configureMutation.isLoading) return;
                    setSource({ type: 'menu', filePath: file.path });
                    configureMutation.mutate({ electionFilePath: file.path });
                  }}
                >
                  <td>{file.name}</td>
                  <td>
                    {DateTime.fromJSDate(file.ctime).toFormat(TIME_FORMAT)}
                  </td>
                  <LoadingIndicator>
                    {configureMutation.isLoading &&
                      source?.type === 'menu' &&
                      source.filePath === file.path && (
                        <span>
                          <Icons.Loading />
                          Loading...
                        </span>
                      )}
                  </LoadingIndicator>
                </ButtonRow>
              ))}
            </tbody>
          </Table>
        )}
        <div>
          {configureMutation.isLoading && source?.type === 'file-picker' ? (
            <LoadingButton>Loading...</LoadingButton>
          ) : (
            <Button
              disabled={configureMutation.isLoading}
              onPress={onSelectOtherFile}
            >
              Select Other File...
            </Button>
          )}
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
