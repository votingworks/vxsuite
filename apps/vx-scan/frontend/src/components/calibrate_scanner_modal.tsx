import React, { useState } from 'react';
import { Scan } from '@votingworks/api';
import { Button, Modal, Prose, useCancelablePromise } from '@votingworks/ui';
import { assert } from '@votingworks/utils';
import { useApiClient } from '../api/api';

export interface CalibrateScannerModalProps {
  scannerStatus: Scan.PrecinctScannerStatus;
  onCancel: VoidFunction;
}

function noop() {
  // noop
}

type CalibrationState = 'ready' | 'calibrating' | 'calibrated' | 'failed';

export function CalibrateScannerModal({
  scannerStatus,
  onCancel,
}: CalibrateScannerModalProps): JSX.Element {
  const apiClient = useApiClient();
  const [calibrationState, setCalibrationState] =
    useState<CalibrationState>('ready');
  const makeCancelable = useCancelablePromise();

  async function calibrate() {
    setCalibrationState('calibrating');
    const success = await makeCancelable(apiClient.calibrate());
    setCalibrationState(success ? 'calibrated' : 'failed');
  }

  if (calibrationState === 'ready') {
    return (
      <Modal
        content={
          <Prose>
            <h1>Calibrate Scanner</h1>
            <p>
              Insert a <strong>blank sheet of white paper</strong> to calibrate
              the scanner. The sheet will not be returned out the front of the
              scanner.
            </p>
          </Prose>
        }
        actions={
          <React.Fragment>
            {scannerStatus?.state === 'ready_to_scan' ? (
              <Button primary onPress={calibrate}>
                Calibrate
              </Button>
            ) : scannerStatus?.state === 'no_paper' ? (
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

  if (calibrationState === 'calibrated') {
    return (
      <Modal
        centerContent
        content={
          <Prose textCenter>
            <h1>Calibration succeeded!</h1>
          </Prose>
        }
        actions={<Button onPress={onCancel}>Close</Button>}
      />
    );
  }

  if (calibrationState === 'failed') {
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
            <Button primary onPress={() => setCalibrationState('ready')}>
              Try again
            </Button>
            <Button onPress={onCancel}>Cancel</Button>
          </React.Fragment>
        }
      />
    );
  }

  assert(calibrationState === 'calibrating');
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
