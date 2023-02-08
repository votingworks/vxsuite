import React, { useState } from 'react';
import { Button, Modal, Prose } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { PrecinctScannerStatus } from '@votingworks/vx-scan-backend';
import { calibrate, supportsCalibration } from '../api';

export interface CalibrateScannerModalProps {
  scannerStatus: PrecinctScannerStatus;
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
  const supportsCalibrationQuery = supportsCalibration.useQuery();
  const calibrateMutation = calibrate.useMutation();
  const [calibrationState, setCalibrationState] =
    useState<CalibrationState>('ready');

  function onCalibrate() {
    setCalibrationState('calibrating');
    calibrateMutation.mutate(undefined, {
      onSuccess: (calibrationResult: boolean) =>
        setCalibrationState(calibrationResult ? 'calibrated' : 'failed'),
    });
  }

  if (supportsCalibrationQuery.data === false) {
    return (
      <Modal
        centerContent
        content={
          <Prose textCenter>
            <h1>Calibration not supported</h1>
            <p>This scanner does not support calibration.</p>
          </Prose>
        }
        actions={<Button onPress={onCancel}>Cancel</Button>}
      />
    );
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
              <Button primary onPress={onCalibrate}>
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
