import {
  getPrecinctById,
  safeParseElectionDefinition,
} from '@votingworks/types';
import React, { useContext, useState } from 'react';
import {
  assert,
  BallotPackage,
  readBallotPackageFromFile,
  readBallotPackageFromFilePointer,
} from '@votingworks/utils';
import { Screen, Main, MainChild } from '@votingworks/ui';
import { LogEventId } from '@votingworks/logging';
import * as config from '../api/config';
import { addTemplates, doneTemplates } from '../api/hmpb';
import { ElectionConfiguration } from '../components/election_configuration';
import { Prose } from '../components/prose';
import { SetElectionDefinition } from '../config/types';
import { AppContext } from '../contexts/app_context';

interface Props {
  setElectionDefinition: SetElectionDefinition;
}

export function LoadElectionScreen({
  setElectionDefinition,
}: Props): JSX.Element {
  const { currentUserSession, logger } = useContext(AppContext);
  assert(currentUserSession);
  const currentUserType = currentUserSession.type;
  const [currentUploadingBallotIndex, setCurrentUploadingBallotIndex] =
    useState(-1);
  const [totalTemplates, setTotalTemplates] = useState(0);
  const [currentUploadingBallot, setCurrentUploadingBallot] = useState<{
    ballotStyle: string;
    precinct: string;
    isLiveMode: boolean;
    locales?: string;
  }>();
  const [isLoadingTemplates, setLoadingTemplates] = useState(false);

  function handleBallotLoading(pkg: BallotPackage) {
    addTemplates(pkg, logger, currentUserType)
      .on('configuring', () => {
        setCurrentUploadingBallotIndex(0);
        setTotalTemplates(pkg.ballots.length);
      })
      .on('uploading', (_pkg, ballot) => {
        const { locales } = ballot.ballotConfig;
        setCurrentUploadingBallot({
          ballotStyle: ballot.ballotConfig.ballotStyleId,
          precinct:
            getPrecinctById({
              election: pkg.electionDefinition.election,
              precinctId: ballot.ballotConfig.precinctId,
            })?.name ?? ballot.ballotConfig.precinctId,
          isLiveMode: ballot.ballotConfig.isLiveMode,
          locales: locales?.secondary
            ? `${locales.primary} / ${locales.secondary}`
            : locales?.primary,
        });
        setCurrentUploadingBallotIndex(pkg.ballots.indexOf(ballot));
      })
      .on('completed', async () => {
        setLoadingTemplates(true);
        await doneTemplates();
        await logger.log(LogEventId.ScannerConfigured, currentUserType, {
          message: 'Scanner successfully configured for ballot package.',
          disposition: 'success',
        });
        setLoadingTemplates(false);
        setElectionDefinition(pkg.electionDefinition);
      });
  }

  async function onManualFileImport(file: File) {
    const isElectionJson = file.name.endsWith('.json');
    const reader = new FileReader();

    if (isElectionJson) {
      await new Promise<void>((resolve, reject) => {
        reader.onload = async () => {
          const electionData = reader.result as string;
          const result = safeParseElectionDefinition(electionData);

          if (result.isErr()) {
            await logger.log(LogEventId.ElectionConfigured, currentUserType, {
              message: 'Election definition failed to be read from usb.',
              disposition: 'failure',
              error: result.err().message,
              result: 'User shown error, no election configured.',
            });
            reject(result.err());
          } else {
            await config.setElection(electionData);
            setElectionDefinition(result.ok());
            resolve();
          }
        };

        reader.readAsText(file);
      });
    } else {
      try {
        const ballotPackage = await readBallotPackageFromFile(file);
        await logger.log(
          LogEventId.BallotPackagedLoadedFromUsb,
          currentUserType,
          {
            message:
              'Ballot package successfully loaded from Usb, now configuring machine for ballot package...',
            disposition: 'success',
          }
        );
        handleBallotLoading(ballotPackage);
      } catch (error) {
        assert(error instanceof Error);
        await logger.log(
          LogEventId.BallotPackagedLoadedFromUsb,
          currentUserType,
          {
            message: 'Error reading ballot package from USB.',
            error: error.message,
            result:
              'User shown error, machine not configured for ballot package.',
            disposition: 'failure',
          }
        );
        throw error;
      }
    }
  }

  async function onAutomaticFileImport(file: KioskBrowser.FileSystemEntry) {
    // All automatic file imports will be on zip packages
    try {
      const ballotPackage = await readBallotPackageFromFilePointer(file);
      await logger.log(
        LogEventId.BallotPackagedLoadedFromUsb,
        currentUserType,
        {
          message:
            'Ballot package successfully loaded from Usb, now configuring machine for ballot package...',
          disposition: 'success',
        }
      );
      handleBallotLoading(ballotPackage);
    } catch (error) {
      assert(error instanceof Error);
      await logger.log(
        LogEventId.BallotPackagedLoadedFromUsb,
        currentUserType,
        {
          message: 'Error reading ballot package from USB.',
          error: error.message,
          result:
            'User shown error, machine not configured for ballot package.',
          disposition: 'failure',
        }
      );
      throw error;
    }
  }

  if (isLoadingTemplates) {
    return (
      <Screen flexDirection="column">
        <Main padded>
          <MainChild center>
            <Prose textCenter>
              <h1>Preparing VxCentralScan…</h1>
            </Prose>
          </MainChild>
        </Main>
      </Screen>
    );
  }

  if (totalTemplates > 0 && currentUploadingBallot) {
    return (
      <Screen flexDirection="column">
        <Main padded>
          <MainChild center>
            <Prose textCenter>
              <h1>
                Uploading ballot package {currentUploadingBallotIndex + 1} of{' '}
                {totalTemplates}
              </h1>
              <ul style={{ textAlign: 'left' }}>
                <li>
                  <strong>Ballot Style:</strong>{' '}
                  {currentUploadingBallot.ballotStyle}
                </li>
                <li>
                  <strong>Precinct:</strong> {currentUploadingBallot.precinct}
                </li>
                <li>
                  <strong>Test Ballot:</strong>{' '}
                  {currentUploadingBallot.isLiveMode ? 'No' : 'Yes'}
                </li>
                <li>
                  <strong>Languages:</strong>{' '}
                  {currentUploadingBallot.locales ?? <em>(unknown)</em>}
                </li>
              </ul>
            </Prose>
          </MainChild>
        </Main>
      </Screen>
    );
  }

  return (
    <ElectionConfiguration
      acceptManuallyChosenFile={onManualFileImport}
      acceptAutomaticallyChosenFile={onAutomaticFileImport}
    />
  );
}
