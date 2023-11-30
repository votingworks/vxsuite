import { useState, useCallback } from 'react';
import { useHistory } from 'react-router-dom';

import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { Button, FileInputButton, Icons, P } from '@votingworks/ui';
import { throwIllegalValue } from '@votingworks/basics';

import { readFileAsyncAsString } from '@votingworks/utils';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import type { ConfigureError } from '@votingworks/admin-backend';
import { readInitialAdminSetupPackageFromFile } from '../utils/initial_setup_package';

import { InputEventFunction } from '../config/types';

import { routerPaths } from '../router_paths';
import { Loading } from '../components/loading';
import { NavigationScreen } from '../components/navigation_screen';
import { configure } from '../api';

const demoElection =
  electionFamousNames2021Fixtures.electionDefinition.electionData;

export function UnconfiguredScreen(): JSX.Element {
  const history = useHistory();
  const configureMutation = configure.useMutation();

  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingZip, setIsUploadingZip] = useState(false);

  const [configureError, setConfigureError] = useState<ConfigureError>();

  const configureMutateAsync = configureMutation.mutateAsync;
  const configureFromElectionPackage = useCallback(
    async (
      electionData: string,
      systemSettingsData: string = JSON.stringify(DEFAULT_SYSTEM_SETTINGS)
    ) => {
      setConfigureError(undefined);
      try {
        const result = await configureMutateAsync({
          electionData,
          systemSettingsData,
        });
        if (result.isErr()) {
          setConfigureError(result.err());
          // eslint-disable-next-line no-console
          console.error(result.err().message);
        }
        return result;
      } catch {
        // Handled by default query client error handling
      }
    },
    [configureMutateAsync]
  );

  async function loadDemoElection() {
    await configureFromElectionPackage(demoElection);
    history.push(routerPaths.election);
  }

  const handleVxElectionFile: InputEventFunction = async (event) => {
    setIsUploading(true);
    const input = event.currentTarget;
    const file = input.files && input.files[0];

    if (file) {
      // TODO: read file content from backend
      const electionData = await readFileAsyncAsString(file);
      await configureFromElectionPackage(electionData);
    }
    setIsUploading(false);
  };

  const handleSetupPackageFile: InputEventFunction = async (event) => {
    setIsUploadingZip(true);
    const input = event.currentTarget;
    const file = input.files && input.files[0];

    if (file) {
      const packageResult = await readInitialAdminSetupPackageFromFile(file);
      if (packageResult.isErr()) {
        setConfigureError(packageResult.err());
        // eslint-disable-next-line no-console
        console.error(packageResult.err().message);
      } else {
        await configureFromElectionPackage(
          packageResult.ok().electionString,
          packageResult.ok().systemSettingsString
        );
      }
    }
    setIsUploadingZip(false);
  };

  if (isUploading || isUploadingZip) {
    return (
      <NavigationScreen>
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  return (
    <NavigationScreen title="Configure VxAdmin">
      {configureError && (
        <P>
          <Icons.Danger color="danger" />{' '}
          {(() => {
            switch (configureError.type) {
              case 'invalidZip':
                return 'Invalid election package zip file.';
              case 'invalidElection':
                return 'Invalid Election Definition file.';
              case 'invalidSystemSettings':
                return 'Invalid System Settings file.';
              /* istanbul ignore next */
              default:
                return throwIllegalValue(configureError);
            }
          })()}
        </P>
      )}
      <P>
        <FileInputButton
          accept=".json,application/json"
          onChange={handleVxElectionFile}
        >
          Select Existing Election Definition File
        </FileInputButton>
      </P>
      <P>
        <FileInputButton
          accept=".zip,application/zip"
          onChange={handleSetupPackageFile}
        >
          Select Existing Setup Package Zip File
        </FileInputButton>
      </P>
      <P>
        <Button onPress={loadDemoElection}>
          Load Demo Election Definition
        </Button>
      </P>
    </NavigationScreen>
  );
}
