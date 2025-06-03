import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  Button,
  CalibrationInsertSingleSheetIllustration,
  FullScreenIconWrapper,
  FullScreenMessage,
  H3,
  Icons,
  Main,
  MainContent,
  MainHeader,
  P,
  Screen,
} from '@votingworks/ui';
import React from 'react';
import { endImageSensorCalibration, getScannerStatus } from '../api';
import { POLLING_INTERVAL_FOR_SCANNER_STATUS_MS } from '../config/globals';

function CalibrationScreen({ children }: { children: React.ReactNode }) {
  return (
    <Screen>
      <Main flexColumn>
        <MainHeader>
          <H3>Image Sensor Calibration</H3>
        </MainHeader>
        <MainContent style={{ display: 'flex', justifyContent: 'center' }}>
          {children}
        </MainContent>
      </Main>
    </Screen>
  );
}

export function ScannerImageSensorCalibrationScreen(): JSX.Element | null {
  const scannerStatusQuery = getScannerStatus.useQuery({
    refetchInterval: POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
  });
  const endImageSensorCalibrationMutation =
    endImageSensorCalibration.useMutation();

  /* istanbul ignore next - @preserve */
  if (!scannerStatusQuery.isSuccess) return null;
  const status = scannerStatusQuery.data;

  /* istanbul ignore next - @preserve */
  assert(
    status.state === 'calibrating_image_sensors.calibrating' ||
      status.state === 'calibrating_image_sensors.done'
  );

  switch (status.state) {
    case 'calibrating_image_sensors.calibrating': {
      return (
        <CalibrationScreen>
          <FullScreenMessage
            title="Insert One Blank Sheet"
            image={<CalibrationInsertSingleSheetIllustration />}
          >
            <P>Feed a single blank calibration sheet into the scanner.</P>
          </FullScreenMessage>
        </CalibrationScreen>
      );
    }

    case 'calibrating_image_sensors.done': {
      const closeButton = (
        <Button
          onPress={() => {
            endImageSensorCalibrationMutation.mutate();
          }}
        >
          Close
        </Button>
      );
      if (status.error) {
        return (
          <CalibrationScreen>
            <FullScreenMessage
              title={
                status.error === 'image_sensor_calibration_timed_out'
                  ? 'Calibration Timed Out'
                  : 'Calibration Failed'
              }
              image={
                <FullScreenIconWrapper>
                  <Icons.Danger color="danger" />
                </FullScreenIconWrapper>
              }
            >
              <P>{closeButton}</P>
            </FullScreenMessage>
          </CalibrationScreen>
        );
      }
      return (
        <CalibrationScreen>
          <FullScreenMessage
            title="Calibration Complete"
            image={
              <FullScreenIconWrapper>
                <Icons.Done color="success" />
              </FullScreenIconWrapper>
            }
          >
            <P>{closeButton}</P>
          </FullScreenMessage>
        </CalibrationScreen>
      );
    }

    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(status.state);
    }
  }
}
