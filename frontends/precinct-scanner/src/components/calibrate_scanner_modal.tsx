import React from 'react';
import { Scan } from '@votingworks/api';
import { Button, Modal, Prose } from '@votingworks/ui';
import * as scanner from '../api/scan';

export interface Props {
  scannerStatus: Scan.PrecinctScannerStatus;
  onCancel: VoidFunction;
}

function noop() {
  // noop
}

export function CalibrateScannerModal({
  scannerStatus,
  onCancel,
}: Props): JSX.Element {
  async function finish() {
    await scanner.waitForPaper();
    onCancel();
  }

  if (scannerStatus.state === 'calibrating') {
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

  if (scannerStatus.state === 'calibrated') {
    if (scannerStatus.error) {
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
              <Button primary onPress={scanner.waitForPaper}>
                Try again
              </Button>
              <Button onPress={finish}>Cancel</Button>
            </React.Fragment>
          }
        />
      );
    }
    return (
      <Modal
        centerContent
        content={
          <Prose textCenter>
            <h1>Calibration succeeded!</h1>
          </Prose>
        }
        actions={<Button onPress={finish}>Close</Button>}
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
            the scanner. The sheet will not be returned out the front of the
            scanner.
          </p>
        </Prose>
      }
      actions={
        <React.Fragment>
          {scannerStatus?.state === 'ready_to_scan' ? (
            <Button primary onPress={scanner.calibrate}>
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
