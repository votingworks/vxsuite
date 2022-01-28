import { ScannerStatus } from '@votingworks/types/api/services/scan';
import { Button, Modal, Prose, useCancelablePromise } from '@votingworks/ui';
import React, { useCallback, useState } from 'react';
import { usePrecinctScanner } from '../hooks/use_precinct_scanner';

export interface Props {
  onCalibrate(): Promise<boolean>;
  onCancel: VoidFunction;
}

function noop() {
  // noop
}

export function CalibrateScannerModal({
  onCancel,
  onCalibrate,
}: Props): JSX.Element {
  const makeCancelable = useCancelablePromise();
  const [calibrationSuccess, setCalibrationSuccess] = useState<boolean>();
  const [isCalibrating, setIsCalibrating] = useState(false);

  const scanner = usePrecinctScanner(isCalibrating ? false : undefined);
  const scannerStatus = scanner?.status.scannerState;

  const beginCalibration = useCallback(async () => {
    setIsCalibrating(true);
    try {
      setCalibrationSuccess(await makeCancelable(onCalibrate()));
    } finally {
      setIsCalibrating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCalibrate, setIsCalibrating]);

  const resetAndTryAgain = useCallback(async () => {
    setCalibrationSuccess(undefined);
  }, [setCalibrationSuccess]);

  if (isCalibrating) {
    return (
      <Modal
        centerContent
        content={
          <Prose textCenter>
            <h1>Calibrating…</h1>
          </Prose>
        }
      />
    );
  }

  if (calibrationSuccess === true) {
    return (
      <Modal
        centerContent
        content={
          <Prose textCenter>
            <h1>Calibration succeeded!</h1>
          </Prose>
        }
        actions={<Button onPress={onCancel}>Back</Button>}
      />
    );
  }

  if (calibrationSuccess === false) {
    return (
      <Modal
        centerContent
        content={
          <Prose textCenter>
            <h1>Calibration failed!</h1>
            <p>There was an error while calibrating.</p>
          </Prose>
        }
        actions={
          <React.Fragment>
            <Button primary onPress={resetAndTryAgain}>
              Try again
            </Button>
            <Button onPress={onCancel}>Cancel</Button>
          </React.Fragment>
        }
      />
    );
  }

  return (
    <Modal
      content={
        <Prose>
          <h1>Calibrate Scanner</h1>
          <p>
            Insert a <strong>blank sheet of white paper</strong> to calibrate
            the scanner. The sheet will be not be returned out the front of the
            scanner.
          </p>
        </Prose>
      }
      actions={
        <React.Fragment>
          {scannerStatus === ScannerStatus.ReadyToScan ? (
            <Button primary onPress={beginCalibration}>
              Calibrate
            </Button>
          ) : scannerStatus === ScannerStatus.WaitingForPaper ? (
            <Button disabled onPress={noop}>
              Waiting for Paper
            </Button>
          ) : (
            <Button disabled onPress={noop}>
              Cannot Calibrate
            </Button>
          )}
          <Button onPress={onCancel}>Cancel</Button>
        </React.Fragment>
      }
    />
  );
}
