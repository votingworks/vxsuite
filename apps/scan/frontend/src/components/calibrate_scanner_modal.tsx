import React, { useState } from 'react';
import { Button, Modal, P, Prose } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { PrecinctScannerStatus } from '@votingworks/scan-backend';
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
        title="Calibration not supported"
        content={
          <Prose textCenter>
            <P>This scanner does not support calibration.</P>
          </Prose>
        }
        actions={<Button onPress={onCancel}>Cancel</Button>}
      />
    );
  }

  if (calibrationState === 'ready') {
    return (
      <Modal
        title="Calibrate Scanner"
        content={
          <Prose>
            <P>
              Insert a <strong>blank sheet of white paper</strong> to calibrate
              the scanner. The sheet will not be returned out the front of the
              scanner.
            </P>
          </Prose>
        }
        actions={
          <React.Fragment>
            {scannerStatus?.state === 'ready_to_scan' ? (
              <Button variant="primary" onPress={onCalibrate}>
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
        title="Calibration succeeded!"
        actions={<Button onPress={onCancel}>Close</Button>}
      />
    );
  }

  if (calibrationState === 'failed') {
    return (
      <Modal
        centerContent
        title="Calibration failed!"
        content={
          <Prose textCenter>
            <P>There was an error while calibrating.</P>
          </Prose>
        }
        actions={
          <React.Fragment>
            <Button
              variant="primary"
              onPress={setCalibrationState}
              value="ready"
            >
              Try again
            </Button>
            <Button onPress={onCancel}>Cancel</Button>
          </React.Fragment>
        }
      />
    );
  }

  assert(calibrationState === 'calibrating');
  return <Modal centerContent title="Calibrating…" />;
}
