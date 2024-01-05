import { Buffer } from 'buffer';
import * as customScanner from '@votingworks/custom-scanner';
import * as pdi from '@votingworks/pdi-rs';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import * as dotenv from 'dotenv';
import * as dotenvExpand from 'dotenv-expand';
import fs from 'fs';
import { detectUsbDrive } from '@votingworks/usb-drive';
import {
  InsertedSmartCardAuth,
  JavaCard,
  MockFileCard,
} from '@votingworks/auth';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';
import {
  assert,
  err,
  ok,
  Optional,
  Result,
  sleep,
  typedAs,
} from '@votingworks/basics';
import { SheetOf } from '@votingworks/types';
import { NODE_ENV, SCAN_WORKSPACE } from './globals';
// import * as customStateMachine from './scanners/custom/state_machine';
import * as pdiStateMachine from './scanners/pdi/state_machine';
import * as server from './server';
import { createWorkspace, Workspace } from './util/workspace';

export type { Api } from './app';
export * from './types';

// https://github.com/bkeepers/dotenv#what-other-env-files-can-i-use
const dotenvPath = '.env';
const dotenvFiles: string[] = [
  `${dotenvPath}.${NODE_ENV}.local`,
  // Don't include `.env.local` for `test` environment
  // since normally you expect tests to produce the same
  // results for everyone
  NODE_ENV !== 'test' ? `${dotenvPath}.local` : '',
  `${dotenvPath}.${NODE_ENV}`,
  dotenvPath,
  NODE_ENV !== 'test' ? `../../../${dotenvPath}.local` : '',
  `../../../${dotenvPath}`,
].filter(Boolean);

// Load environment variables from .env* files. Suppress warnings using silent
// if this file is missing. dotenv will never modify any environment variables
// that have already been set.  Variable expansion is supported in .env files.
// https://github.com/motdotla/dotenv
// https://github.com/motdotla/dotenv-expand
for (const dotenvFile of dotenvFiles) {
  if (fs.existsSync(dotenvFile)) {
    dotenvExpand.expand(dotenv.config({ path: dotenvFile }));
  }
}

const logger = new Logger(LogSource.VxScanBackend);

async function resolveWorkspace(): Promise<Workspace> {
  const workspacePath = SCAN_WORKSPACE;
  if (!workspacePath) {
    await logger.log(LogEventId.ScanServiceConfigurationMessage, 'system', {
      message:
        'workspace path could not be determined; pass a workspace or run with SCAN_WORKSPACE',
      disposition: 'failure',
    });
    throw new Error(
      'workspace path could not be determined; pass a workspace or run with SCAN_WORKSPACE'
    );
  }
  return createWorkspace(workspacePath);
}

async function main(): Promise<number> {
  const auth = new InsertedSmartCardAuth({
    card:
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
      isIntegrationTest()
        ? new MockFileCard()
        : new JavaCard(),
    config: {},
    logger,
  });
  const workspace = await resolveWorkspace();
  const usbDrive = detectUsbDrive(logger);
  let lastEvent: Optional<pdi.Event>;

  function getLastEvent(): Optional<pdi.Event> {
    return lastEvent;
  }

  const openPdiScanner: typeof customScanner.openScanner = async () => {
    console.log('openPdiScanner');
    const result = await customScanner.openScanner();
    if (result.isErr()) {
      console.log('openPdiScanner: error', result.err());
      return result;
    }

    const pdiScanner = (() => {
      try {
        return pdi.Scanner.open();
      } catch (e) {
        console.log('pdiScanner failed', e);
      }
    })();

    console.log('pdiScanner', pdiScanner);
    assert(pdiScanner, 'pdiScanner is null');
    pdiScanner.setResolution(200);
    pdiScanner.setColorDepth(pdi.ColorDepth.Bitonal);
    pdiScanner.setFeederEnabled(true);

    function updateLastEvent(): void {
      try {
        const newLastEvent = pdiScanner?.getLastScannerEvent();
        if (newLastEvent) {
          lastEvent = newLastEvent;
          console.log('updateLastEvent', lastEvent);
        }
      } catch (e) {
        console.log('updateLastEvent failed', e);
      }
    }

    const scanner = result.ok();
    return ok({
      connect() {
        return scanner.connect();
      },

      disconnect() {
        return scanner.disconnect();
      },

      getReleaseVersion(releaseType) {
        return scanner.getReleaseVersion(releaseType);
      },

      getStatus() {
        updateLastEvent();

        const defaultStatus: customScanner.ScannerStatus = {
          isDoubleSheet: false,
          isScanCanceled: false,
          isScanInProgress: false,
          isLoadingPaper: false,
          isExternalCoverCloseSensor: false,
          isPrintHeadReady: false,
          isScannerCoverOpen: false,
          isPaperJam: false,
          isJamPaperHeldBack: false,
          isMotorOn: false,
          isTicketOnEnterCenter: false,
          isTicketOnEnterA4: false,
          isTicketLoaded: false,
          isTicketOnExit: false,

          sensorInputCenterLeft: customScanner.SensorStatus.NoPaper,
          sensorInputCenterRight: customScanner.SensorStatus.NoPaper,
          sensorInputLeftLeft: customScanner.SensorStatus.NoPaper,
          sensorInputRightRight: customScanner.SensorStatus.NoPaper,
          sensorInternalInputLeft: customScanner.SensorStatus.NoPaper,
          sensorInternalInputRight: customScanner.SensorStatus.NoPaper,
          sensorOutputCenterLeft: customScanner.SensorStatus.NoPaper,
          sensorOutputCenterRight: customScanner.SensorStatus.NoPaper,
          sensorOutputLeftLeft: customScanner.SensorStatus.NoPaper,
          sensorOutputRightRight: customScanner.SensorStatus.NoPaper,
          sensorVoidPrintHead: customScanner.SensorStatus.NoPaper,
        };

        switch (getLastEvent()) {
          case pdi.Event.BeginScan:
            console.log('BEGIN SCAN');
            return Promise.resolve(
              ok({
                ...defaultStatus,
                sensorInputLeftLeft: customScanner.SensorStatus.PaperPresent,
                sensorInputCenterLeft: customScanner.SensorStatus.PaperPresent,
                sensorInputCenterRight: customScanner.SensorStatus.PaperPresent,
                sensorInputRightRight: customScanner.SensorStatus.PaperPresent,
                isScanInProgress: true,
              })
            );

          case pdi.Event.EndScan:
            console.log('END SCAN');
            return Promise.resolve(
              ok({
                ...defaultStatus,
                sensorOutputLeftLeft: customScanner.SensorStatus.PaperPresent,
                sensorOutputCenterLeft: customScanner.SensorStatus.PaperPresent,
                sensorOutputCenterRight:
                  customScanner.SensorStatus.PaperPresent,
                sensorOutputRightRight: customScanner.SensorStatus.PaperPresent,
              })
            );

          case pdi.Event.AbortScan:
            console.log('ABORT SCAN');
            return Promise.resolve(
              ok({
                ...defaultStatus,
                isScanCanceled: true,
              })
            );

          default:
            console.log('ignoring last event', getLastEvent());
            break;
        }

        const status = pdiScanner.getStatus();

        return Promise.resolve(
          ok({
            ...defaultStatus,
            sensorInputLeftLeft: status.frontM1SensorCovered
              ? customScanner.SensorStatus.PaperPresent
              : customScanner.SensorStatus.NoPaper,
            sensorInputCenterLeft: status.frontM2SensorCovered
              ? customScanner.SensorStatus.PaperPresent
              : customScanner.SensorStatus.NoPaper,
            sensorInputCenterRight: status.frontM3SensorCovered
              ? customScanner.SensorStatus.PaperPresent
              : customScanner.SensorStatus.NoPaper,
            sensorInputRightRight: status.frontM4SensorCovered
              ? customScanner.SensorStatus.PaperPresent
              : customScanner.SensorStatus.NoPaper,
            sensorOutputLeftLeft: status.rearLeftSensorCovered
              ? customScanner.SensorStatus.PaperPresent
              : customScanner.SensorStatus.NoPaper,
            sensorOutputCenterLeft: status.rearLeftSensorCovered
              ? customScanner.SensorStatus.PaperPresent
              : customScanner.SensorStatus.NoPaper,
            sensorOutputCenterRight: status.rearRightSensorCovered
              ? customScanner.SensorStatus.PaperPresent
              : customScanner.SensorStatus.NoPaper,
            sensorOutputRightRight: status.rearRightSensorCovered
              ? customScanner.SensorStatus.PaperPresent
              : customScanner.SensorStatus.NoPaper,
            isPaperJam: status.ticketJam,
            isMotorOn: status.documentInScanner,
          })
        );
      },

      getStatusRaw() {
        // return scanner.getStatusRaw();
        throw new Error('getStatusRaw not implemented');
      },

      move(movement) {
        console.log('MOVE', movement);
        switch (movement) {
          case customScanner.FormMovement.EJECT_PAPER_FORWARD:
            pdiScanner.acceptDocumentBack();
            lastEvent = undefined;
            break;

          case customScanner.FormMovement.RETRACT_PAPER_BACKWARD:
            try {
              pdiScanner.rejectAndHoldDocumentFront();
            } catch (e) {
              console.log('rejectAndHoldDocumentFront failed', e);
            }
            lastEvent = undefined;
            break;

          default:
            console.warn('ignoring move', movement);
            break;
        }

        return Promise.resolve(ok());
      },

      async scan(
        scanParameters,
        options
      ): Promise<
        Result<SheetOf<customScanner.ImageFromScanner>, customScanner.ErrorCode>
      > {
        assert(
          getLastEvent() === pdi.Event.BeginScan,
          'scan called before begin'
        );

        let scannedDocument: Optional<pdi.ScannedDocument>;
        console.log('scan', scanParameters, options);

        do {
          scannedDocument ??= pdiScanner.getLastScannedDocument();
          await sleep(10);
          updateLastEvent();
        } while (getLastEvent() === pdi.Event.BeginScan && !scannedDocument);
        lastEvent = undefined;

        console.log('scannedDocument', scannedDocument);
        if (scannedDocument) {
          return ok(
            typedAs<SheetOf<customScanner.ImageFromScanner>>([
              {
                imageBuffer: Buffer.from(scannedDocument.frontSideImage.data),
                imageDepth: customScanner.ImageColorDepthType.Grey8bpp,
                imageFormat: customScanner.ImageFileFormat.Bmp,
                imageWidth: scannedDocument.frontSideImage.width,
                imageHeight: scannedDocument.frontSideImage.height,
                imageResolution: 200,
                scanSide: customScanner.ScanSide.A,
              },
              {
                imageBuffer: Buffer.from(scannedDocument.backSideImage.data),
                imageDepth: customScanner.ImageColorDepthType.Grey8bpp,
                imageFormat: customScanner.ImageFileFormat.Bmp,
                imageWidth: scannedDocument.backSideImage.width,
                imageHeight: scannedDocument.backSideImage.height,
                imageResolution: 200,
                scanSide: customScanner.ScanSide.B,
              },
            ])
          );
        }

        return err(customScanner.ErrorCode.NoDocumentScanned);
      },

      resetHardware() {
        console.log('ignoring resetHardware');
        // return scanner.resetHardware();
        throw new Error('resetHardware not implemented');
      },
    });
  };

  const precinctScannerStateMachine =
    pdiStateMachine.createPrecinctScannerStateMachine({
      createCustomClient: openPdiScanner,
      auth,
      workspace,
      logger,
      usbDrive,
    });

  server.start({
    auth,
    precinctScannerStateMachine,
    workspace,
    usbDrive,
    logger,
  });

  return 0;
}

if (require.main === module) {
  void main()
    .catch((error) => {
      void logger.log(LogEventId.ApplicationStartup, 'system', {
        message: `Error in starting VxScan backend: ${error.stack}`,
        disposition: 'failure',
      });
      return 1;
    })
    .then((code) => {
      process.exitCode = code;
    });
}
