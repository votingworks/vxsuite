import { useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useHistory } from 'react-router-dom';

import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { Button, Font, Icons, P, useMountedState } from '@votingworks/ui';
import { assert } from '@votingworks/basics';

import type { ConfigureResult } from '@votingworks/admin-backend';
import { readFileAsyncAsString } from '@votingworks/utils';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { readInitialAdminSetupPackageFromFile } from '../utils/initial_setup_package';
import {
  getElectionDefinitionConverterClient,
  VxFile,
} from '../lib/converters';

import { InputEventFunction } from '../config/types';

import { AppContext } from '../contexts/app_context';

import { routerPaths } from '../router_paths';
import { FileInputButton } from '../components/file_input_button';
import { HorizontalRule } from '../components/horizontal_rule';
import { Loading } from '../components/loading';
import { NavigationScreen } from '../components/navigation_screen';
import { configure, setSystemSettings } from '../api';

interface InputFile {
  name: string;
  file: File;
}

function allFilesExist(files: VxFile[]) {
  return files.every((f) => f.path);
}
function someFilesExist(files: VxFile[]) {
  return files.some((f) => f.path);
}

const demoElection =
  electionFamousNames2021Fixtures.electionDefinition.electionData;

export function UnconfiguredScreen(): JSX.Element {
  const history = useHistory();
  const isMounted = useMountedState();
  const configureMutation = configure.useMutation();
  const setSystemSettingsMutation = setSystemSettings.useMutation();

  const configureMutateAsync = useCallback(
    async (electionData) => {
      return new Promise<ConfigureResult>((resolve) => {
        configureMutation.mutate(
          {
            electionData,
          },
          {
            onSuccess: resolve,
          }
        );
      });
    },
    [configureMutation]
  );

  const { converter } = useContext(AppContext);

  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingZip, setIsUploadingZip] = useState(false);

  const [inputConversionFiles, setInputConversionFiles] = useState<VxFile[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [vxElectionFileIsInvalid, setVxElectionFileIsInvalid] = useState(false);
  const [systemSettingsFileIsInvalid, setSystemSettingsFileIsInvalid] =
    useState(false);
  const [isUsingConverter, setIsUsingConverter] = useState(false);

  const client = useMemo(
    () => getElectionDefinitionConverterClient(converter),
    [converter]
  );

  const saveSystemSettingsToBackend = useCallback(
    (fileContent: string) => {
      setSystemSettingsMutation.mutate(
        { systemSettings: fileContent },
        {
          onSuccess: (result) => {
            if (result.isErr()) {
              setSystemSettingsFileIsInvalid(true);
            }
          },
        }
      );
    },
    [setSystemSettingsMutation]
  );

  async function loadDemoElection() {
    await configureMutateAsync(demoElection);
    saveSystemSettingsToBackend(JSON.stringify(DEFAULT_SYSTEM_SETTINGS));
    history.push(routerPaths.electionDefinition);
  }

  const saveElectionToBackend = useCallback(
    async (fileContent: string) => {
      const configureResult = await configureMutateAsync(fileContent);
      if (configureResult.isErr()) {
        setVxElectionFileIsInvalid(true);
        // eslint-disable-next-line no-console
        console.error(
          'configureMutateAsync failed in saveElectionToBackend',
          configureResult.err().message
        );
      }
    },
    [configureMutateAsync]
  );

  const handleVxElectionFile: InputEventFunction = async (event) => {
    setIsUploading(true);
    const input = event.currentTarget;
    const file = input.files && input.files[0];

    if (file) {
      setVxElectionFileIsInvalid(false);
      // TODO: read file content from backend
      const fileContent = await readFileAsyncAsString(file);
      await saveElectionToBackend(fileContent);
      saveSystemSettingsToBackend(JSON.stringify(DEFAULT_SYSTEM_SETTINGS));
    }
    setIsUploading(false);
  };

  const handleSetupPackageFile: InputEventFunction = async (event) => {
    setIsUploadingZip(true);
    const input = event.currentTarget;
    const file = input.files && input.files[0];

    if (file) {
      const initialSetupPackage = await readInitialAdminSetupPackageFromFile(
        file
      );
      setVxElectionFileIsInvalid(false);
      setSystemSettingsFileIsInvalid(false);
      await saveElectionToBackend(initialSetupPackage.electionString);
      saveSystemSettingsToBackend(initialSetupPackage.systemSettingsString);
    }
    setIsUploadingZip(false);
  };

  const resetServerFiles = useCallback(async () => {
    assert(client);
    try {
      await client.reset();
    } catch (error) {
      console.log('failed resetServerFiles()', error); // eslint-disable-line no-console
    }
  }, [client]);

  const getOutputFile = useCallback(
    async (electionFileName: string) => {
      assert(client);
      try {
        setIsLoading(true);
        const blob = await client.getOutputFile(electionFileName);
        await resetServerFiles();
        const electionData = await new Response(blob).text();
        // expect our own converted elections to be valid
        await configureMutateAsync(electionData);
      } catch (error) {
        console.log('failed getOutputFile()', error); // eslint-disable-line no-console
      } finally {
        setIsLoading(false);
      }
    },
    [client, configureMutateAsync, resetServerFiles]
  );

  const processInputFiles = useCallback(
    async (electionFileName: string) => {
      assert(client);
      try {
        setIsLoading(true);
        await client.process();
        await getOutputFile(electionFileName);
      } catch (error) {
        console.log('failed processInputFiles()', error); // eslint-disable-line no-console
        await client.reset();
      } finally {
        setIsLoading(false);
      }
    },
    [client, getOutputFile, setIsLoading]
  );

  const updateStatus = useCallback(async () => {
    try {
      if (!client) {
        return;
      }

      const files = await client.getFiles();

      if (!isMounted()) {
        return;
      }

      const electionFile = files.outputFiles[0];
      if (!electionFile) {
        return;
      }

      if (electionFile.path) {
        await getOutputFile(electionFile.name);
        return;
      }

      if (allFilesExist(files.inputFiles)) {
        await processInputFiles(electionFile.name);
        return;
      }

      if (
        inputConversionFiles.length !== files.inputFiles.length ||
        files.inputFiles.some(
          (inputFile, index) =>
            inputFile.path !== inputConversionFiles[index].path
        )
      ) {
        setInputConversionFiles(files.inputFiles);
      }
    } catch (error) {
      console.log('failed updateStatus()', error); // eslint-disable-line no-console
    }
  }, [
    client,
    getOutputFile,
    inputConversionFiles,
    isMounted,
    processInputFiles,
  ]);

  async function submitFile({ file, name }: InputFile) {
    try {
      assert(client);
      await client.setInputFile(name, file);
      await updateStatus();
    } catch (error) {
      console.log('failed handleFileInput()', error); // eslint-disable-line no-console
    }
  }

  const handleFileInput: InputEventFunction = async (event) => {
    const input = event.currentTarget;
    const file = input.files && input.files[0];
    const { name } = input;
    if (file && name) {
      await submitFile({ file, name });
    }
  };

  async function resetUploadFiles() {
    setInputConversionFiles([]);
    setVxElectionFileIsInvalid(false);
    await resetServerFiles();
    await updateStatus();
  }

  async function resetUploadFilesAndGoBack() {
    await resetUploadFiles();
    setIsUsingConverter(false);
  }

  useEffect(() => {
    void updateStatus();
  }, [updateStatus]);

  if (isUploading || isUploadingZip || isLoading) {
    return (
      <NavigationScreen centerChild>
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  if (isUsingConverter && inputConversionFiles.length > 0) {
    return (
      <NavigationScreen
        centerChild
        title={`Convert from ${client?.getDisplayName()} files`}
      >
        <Font align="center">
          <P> Select the following files from a USB drive, etc.</P>
          {inputConversionFiles.map((file) =>
            file.path ? (
              <P key={file.name}>
                <Font color="success">
                  <Icons.Checkbox />
                </Font>{' '}
                Loaded {file.name}
              </P>
            ) : (
              <P key={file.name}>
                <FileInputButton
                  accept={file.accept}
                  buttonProps={{
                    fullWidth: true,
                  }}
                  name={file.name}
                  onChange={handleFileInput}
                >
                  {file.name}
                </FileInputButton>
              </P>
            )
          )}
          <P>
            <Button
              disabled={
                !someFilesExist(inputConversionFiles) &&
                !vxElectionFileIsInvalid
              }
              onPress={resetUploadFiles}
            >
              Reset Files
            </Button>
          </P>
          <HorizontalRule />
          <P>
            <Button variant="previous" onPress={resetUploadFilesAndGoBack}>
              Back
            </Button>
          </P>
        </Font>
      </NavigationScreen>
    );
  }

  return (
    <NavigationScreen centerChild title="Configure VxAdmin">
      <Font align="center">
        <P>How would you like to start?</P>
        {vxElectionFileIsInvalid && (
          <P>
            <Font color="danger">
              <Icons.Danger />
            </Font>{' '}
            Invalid Vx Election Definition file.
          </P>
        )}
        {systemSettingsFileIsInvalid && (
          <P>
            <Font color="danger">
              <Icons.Danger />
            </Font>{' '}
            Invalid System Settings file.
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

        {client && inputConversionFiles.length > 0 && !isUsingConverter && (
          <P>
            <Button onPress={() => setIsUsingConverter(true)}>
              Convert from {client.getDisplayName()} files
            </Button>
          </P>
        )}
        <P>
          <Button onPress={loadDemoElection}>
            Load Demo Election Definition
          </Button>
        </P>
      </Font>
    </NavigationScreen>
  );
}
