import React, { useContext, useState, useEffect, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';

import { safeParseElection } from '@votingworks/types';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { Button, Prose, useMountedState } from '@votingworks/ui';
import { assert } from '@votingworks/utils';

import {
  ConverterClient,
  getElectionDefinitionConverterClient,
  VxFile,
} from '../lib/converters';
import { readFileAsync } from '../lib/read_file_async';

import { InputEventFunction } from '../config/types';

import { AppContext } from '../contexts/app_context';

import { routerPaths } from '../router_paths';
import { FileInputButton } from '../components/file_input_button';
import { HorizontalRule } from '../components/horizontal_rule';
import { Loading } from '../components/loading';
import { NavigationScreen } from '../components/navigation_screen';

const Loaded = styled.p`
  line-height: 2.5rem;
  color: rgb(0, 128, 0);
  &::before {
    content: '✓ ';
  }
`;
const Invalid = styled.p`
  line-height: 2.5rem;
  color: rgb(128, 0, 0);
  &::before {
    content: '✘ ';
  }
`;

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

  const { converter, saveElection } = useContext(AppContext);

  const [isUploading, setIsUploading] = useState(false);

  const [inputConversionFiles, setInputConversionFiles] = useState<VxFile[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [vxElectionFileIsInvalid, setVxElectionFileIsInvalid] = useState(false);
  const [client, setClient] = useState<ConverterClient>();
  const [isUsingConverter, setIsUsingConverter] = useState(false);

  useEffect(() => {
    setClient(getElectionDefinitionConverterClient(converter));
  }, [converter]);

  async function loadDemoElection() {
    await saveElection(demoElection);
    history.push(routerPaths.electionDefinition);
  }

  const validateAndSaveElection = useCallback(
    async (electionJson: string) => {
      safeParseElection(electionJson).unsafeUnwrap();
      await saveElection(electionJson);
    },
    [saveElection]
  );

  const handleVxElectionFile: InputEventFunction = async (event) => {
    setIsUploading(true);
    const input = event.currentTarget;
    const file = input.files && input.files[0];

    if (file) {
      setVxElectionFileIsInvalid(false);
      try {
        const fileContent = await readFileAsync(file);
        await validateAndSaveElection(fileContent);
      } catch (error) {
        setVxElectionFileIsInvalid(true);
        console.error('handleVxElectionFile failed', error); // eslint-disable-line no-console
      } finally {
        setIsUploading(false);
      }
    }
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
        const electionJson = await new Response(blob).text();
        await validateAndSaveElection(electionJson);
      } catch (error) {
        console.log('failed getOutputFile()', error); // eslint-disable-line no-console
      } finally {
        setIsLoading(false);
      }
    },
    [client, resetServerFiles, validateAndSaveElection]
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

      setInputConversionFiles(files.inputFiles);
    } catch (error) {
      console.log('failed updateStatus()', error); // eslint-disable-line no-console
    }
  }, [client, getOutputFile, isMounted, processInputFiles]);

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

  if (isUploading || isLoading) {
    return (
      <NavigationScreen centerChild>
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  if (isUsingConverter && inputConversionFiles.length > 0) {
    return (
      <NavigationScreen centerChild>
        <Prose textCenter>
          <h1>Convert from {client?.getDisplayName()} files</h1>
          <p> Select the following files from a USB drive, etc.</p>
          {inputConversionFiles.map((file) =>
            file.path ? (
              <Loaded key={file.name}>{`Loaded ${file.name}`}</Loaded>
            ) : (
              <p key={file.name}>
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
              </p>
            )
          )}
          <p>
            <Button
              disabled={
                !someFilesExist(inputConversionFiles) &&
                !vxElectionFileIsInvalid
              }
              small
              onPress={resetUploadFiles}
            >
              Reset Files
            </Button>
          </p>
          <HorizontalRule />
          <p>
            <Button small onPress={resetUploadFilesAndGoBack}>
              back
            </Button>
          </p>
        </Prose>
      </NavigationScreen>
    );
  }

  return (
    <NavigationScreen centerChild>
      <Prose textCenter>
        <h1>Configure VxAdmin</h1>
        <p>How would you like to start?</p>
        {vxElectionFileIsInvalid && (
          <Invalid>Invalid Vx Election Definition file.</Invalid>
        )}
        <p>
          <FileInputButton
            accept=".json,application/json"
            onChange={handleVxElectionFile}
          >
            Select Existing Election Definition File
          </FileInputButton>
        </p>

        {client && inputConversionFiles.length > 0 && (
          <React.Fragment>
            <HorizontalRule>or</HorizontalRule>
            {!isUsingConverter && (
              <Button onPress={() => setIsUsingConverter(true)}>
                Convert from {client.getDisplayName()} files
              </Button>
            )}
          </React.Fragment>
        )}
        <HorizontalRule>or</HorizontalRule>
        <p>
          <Button onPress={loadDemoElection}>
            Load Demo Election Definition
          </Button>
        </p>
      </Prose>
    </NavigationScreen>
  );
}
