import React, { useState, useEffect } from 'react';
import { join } from 'path';
import { getPrecinctById } from '@votingworks/types';
import {
  assert,
  readBallotPackageFromFilePointer,
  usbstick,
} from '@votingworks/utils';
import { addTemplates } from '../api/config';
import { PRECINCT_SCANNER_FOLDER } from '../config/globals';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';
import {
  QuestionCircle,
  IndeterminateProgressBar,
} from '../components/graphics';

interface Props {
  usbDriveStatus: usbstick.UsbDriveStatus;
  refreshConfig: () => Promise<void>;
}

export function UnconfiguredElectionScreen({
  usbDriveStatus,
  refreshConfig,
}: Props): JSX.Element {
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoadingBallotPackage, setIsLoadingBallotPackage] = useState(false);

  const [currentUploadingBallotIndex, setCurrentUploadingBallotIndex] =
    useState(-1);
  const [totalTemplates, setTotalTemplates] = useState(0);
  const [currentUploadingBallot, setCurrentUploadingBallot] = useState<{
    ballotStyle: string;
    precinct: string;
    isLiveMode: boolean;
    locales?: string;
  }>();

  useEffect(() => {
    async function attemptToLoadBallotPackageFromUsb() {
      if (usbDriveStatus !== usbstick.UsbDriveStatus.mounted) {
        setErrorMessage('');
        setIsLoadingBallotPackage(false);
        setTotalTemplates(0);
        return;
      }
      setIsLoadingBallotPackage(true);

      try {
        const usbPath = await usbstick.getDevicePath();
        let files: KioskBrowser.FileSystemEntry[];
        try {
          assert(typeof usbPath !== 'undefined');
          assert(window.kiosk);
          files = await window.kiosk.getFileSystemEntries(
            join(usbPath, PRECINCT_SCANNER_FOLDER)
          );
        } catch (error) {
          throw new Error('No ballot package found on the inserted USB drive.');
        }
        const ballotPackages = files.filter(
          (f) => f.type === 1 && f.name.endsWith('.zip')
        );

        if (ballotPackages.length === 0) {
          throw new Error('No ballot package found on the inserted USB drive.');
        }

        // Get the most recently-created ballot package.
        const ballotPackage = await readBallotPackageFromFilePointer(
          // eslint-disable-next-line vx/gts-safe-number-parse
          [...ballotPackages].sort((a, b) => +b.ctime - +a.ctime)[0]
        );
        addTemplates(ballotPackage)
          .on('configuring', () => {
            setCurrentUploadingBallotIndex(0);
            setTotalTemplates(ballotPackage.ballots.length);
            setIsLoadingBallotPackage(false);
          })
          .on('uploading', (_pkg, ballot) => {
            const { locales } = ballot.ballotConfig;
            setCurrentUploadingBallot({
              ballotStyle: ballot.ballotConfig.ballotStyleId,
              precinct:
                /* istanbul ignore next */
                getPrecinctById({
                  election: ballotPackage.electionDefinition.election,
                  precinctId: ballot.ballotConfig.precinctId,
                })?.name ?? ballot.ballotConfig.precinctId,
              isLiveMode: ballot.ballotConfig.isLiveMode,
              locales: locales?.secondary
                ? `${locales.primary} / ${locales.secondary}`
                : locales?.primary,
            });
            setCurrentUploadingBallotIndex(
              ballotPackage.ballots.indexOf(ballot)
            );
          })
          .on('completed', async () => {
            await refreshConfig();
          });
      } catch (error) {
        if (error instanceof Error) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage('Unknown Error');
        }
        setIsLoadingBallotPackage(false);
      }
    }

    // function handles its own errors, so no `.catch` needed
    void attemptToLoadBallotPackageFromUsb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usbDriveStatus]);

  let content = (
    <React.Fragment>
      <QuestionCircle />
      <CenteredLargeProse>
        <h1>VxScan is Not Configured</h1>
        <p>
          {errorMessage === ''
            ? 'Insert USB Drive with configuration.'
            : `Error in configuration: ${errorMessage}`}
        </p>
      </CenteredLargeProse>
    </React.Fragment>
  );
  if (isLoadingBallotPackage) {
    content = (
      <React.Fragment>
        <IndeterminateProgressBar />
        <CenteredLargeProse>
          <h1>Searching USB for ballot package…</h1>
        </CenteredLargeProse>
      </React.Fragment>
    );
  }

  if (totalTemplates > 0 && currentUploadingBallot) {
    content = (
      <React.Fragment>
        <IndeterminateProgressBar />
        <CenteredLargeProse>
          <h1>
            Loading ballot package {currentUploadingBallotIndex + 1} of{' '}
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
              {
                /* istanbul ignore next */ currentUploadingBallot.locales ?? (
                  <em>(unknown)</em>
                )
              }
            </li>
          </ul>
        </CenteredLargeProse>
      </React.Fragment>
    );
  }

  return (
    <ScreenMainCenterChild infoBar={false}>{content}</ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return (
    <UnconfiguredElectionScreen
      usbDriveStatus={usbstick.UsbDriveStatus.notavailable}
      refreshConfig={() => Promise.resolve()}
    />
  );
}
