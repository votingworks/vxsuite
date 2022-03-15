import React, { useContext, useState, useEffect, useCallback } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { parseElection } from '@votingworks/types';

import { Modal, useCancelablePromise } from '@votingworks/ui';
import { ConverterClient, VxFile } from '../lib/converter_client';
import { readFileAsync } from '../lib/read_file_async';

import { InputEventFunction } from '../config/types';

import defaultElection from '../data/defaultElection.json';

import { AppContext } from '../contexts/app_context';

import { Button } from '../components/button';
import { routerPaths } from '../router_paths';
import { FileInputButton } from '../components/file_input_button';
import { HorizontalRule } from '../components/horizontal_rule';
import { Prose } from '../components/prose';
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

const newElection = JSON.stringify(defaultElection);

export function UnconfiguredScreen(): JSX.Element {
  const history = useHistory();
  const location = useLocation();
  const makeCancelable = useCancelablePromise();

  const { saveElection } = useContext(AppContext);

  const [isUploading, setIsUploading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const [inputConversionFiles, setInputConversionFiles] = useState<VxFile[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [vxElectionFileIsInvalid, setVxElectionFileIsInvalid] = useState(false);
  const [client] = useState(new ConverterClient('election'));
  const [isConvertSems, setIsConvertSems] = useState(false);

  async function createNewElection() {
    await saveElection(newElection);
    history.push(routerPaths.electionDefinition);
  }

  const saveElectionAndShowSuccess = useCallback(
    (electionJson: string) => {
      parseElection(JSON.parse(electionJson));
      setShowSuccess(true);
      setTimeout(async () => {
        setShowSuccess(false);
        await saveElection(electionJson);
      }, 3000);
    },
    [saveElection, setShowSuccess]
  );

  const handleVxElectionFile: InputEventFunction = async (event) => {
    setIsUploading(true);
    const input = event.currentTarget;
    const file = input.files && input.files[0];

    if (file) {
      setVxElectionFileIsInvalid(false);
      try {
        const fileContent = await readFileAsync(file);
        saveElectionAndShowSuccess(fileContent);
      } catch (error) {
        setVxElectionFileIsInvalid(true);
        console.error('handleVxElectionFile failed', error); // eslint-disable-line no-console
      } finally {
        setIsUploading(false);
      }
    }
  };

  const resetServerFiles = useCallback(async () => {
    try {
      await client.reset();
    } catch (error) {
      console.log('failed resetServerFiles()', error); // eslint-disable-line no-console
    }
  }, [client]);

  const getOutputFile = useCallback(
    async (electionFileName: string) => {
      try {
        const blob = await client.getOutputFile(electionFileName);
        await resetServerFiles();
        const electionJson = await new Response(blob).text();
        saveElectionAndShowSuccess(electionJson);
      } catch (error) {
        console.log('failed getOutputFile()', error); // eslint-disable-line no-console
      } finally {
        setIsLoading(false);
      }
    },
    [client, resetServerFiles, saveElectionAndShowSuccess]
  );

  const processInputFiles = useCallback(
    async (electionFileName: string) => {
      try {
        await client.process();
        await getOutputFile(electionFileName);
      } catch (error) {
        console.log('failed processInputFiles()', error); // eslint-disable-line no-console
        await client.reset();
        setIsLoading(false);
      }
    },
    [client, getOutputFile, setIsLoading]
  );

  const updateStatus = useCallback(async () => {
    try {
      const files = await makeCancelable(client.getFiles());

      setIsLoading(true);

      const electionFile = files.outputFiles[0];
      if (electionFile.path) {
        await getOutputFile(electionFile.name);
        return;
      }

      if (allFilesExist(files.inputFiles)) {
        await processInputFiles(electionFile.name);
        return;
      }

      setInputConversionFiles(files.inputFiles);
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
    }
  }, [client, getOutputFile, makeCancelable, processInputFiles]);

  async function submitFile({ file, name }: InputFile) {
    try {
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
    setIsConvertSems(false);
  }

  useEffect(() => {
    void updateStatus();
  }, [updateStatus]);

  useEffect(() => {
    if (location.pathname !== '/') {
      history.push(routerPaths.root);
    }
  }, [location, history]);

  if (isUploading || isLoading) {
    return (
      <NavigationScreen>
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  if (showSuccess) {
    return (
      <NavigationScreen>
        <Modal
          centerContent
          content={
            <Prose textCenter>
              <Loading as="h1">Election loading</Loading>
            </Prose>
          }
        />
      </NavigationScreen>
    );
  }

  if (isConvertSems && inputConversionFiles.length > 0) {
    return (
      <NavigationScreen mainChildCenter>
        <Prose textCenter>
          <h1>Convert from SEMS files</h1>
          <p> Select the following files from a USB drive, etc.</p>
          {inputConversionFiles.map((file: VxFile) =>
            file.path ? (
              <Loaded key={file.name}>{`Loaded ${file.name}`}</Loaded>
            ) : (
              <p key={file.name}>
                <FileInputButton
                  accept=".txt"
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
    <NavigationScreen mainChildCenter>
      <Prose textCenter>
        <h1>Configure VxAdmin</h1>
        <p>How would you like to start?</p>
        <p>
          <Button onPress={createNewElection}>
            Create New Election Definition
          </Button>
        </p>
        <HorizontalRule>or</HorizontalRule>

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

        {inputConversionFiles.length > 0 && (
          <React.Fragment>
            <HorizontalRule>or</HorizontalRule>
            {!isConvertSems && (
              <Button onPress={() => setIsConvertSems(true)}>
                Convert from SEMS files
              </Button>
            )}
          </React.Fragment>
        )}
      </Prose>
    </NavigationScreen>
  );
}
