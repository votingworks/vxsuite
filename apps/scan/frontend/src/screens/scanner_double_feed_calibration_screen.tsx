import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  Button,
  DoubleFeedCalibrationDoubleSheetIllustration,
  DoubleFeedCalibrationSingleSheetIllustration,
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
import { endDoubleFeedCalibration, getScannerStatus } from '../api';
import { POLLING_INTERVAL_FOR_SCANNER_STATUS_MS } from '../config/globals';

function CalibrationScreen({ children }: { children: React.ReactNode }) {
  return (
    <Screen>
      <Main flexColumn>
        <MainHeader>
          <H3>Double Sheet Detection Calibration</H3>
        </MainHeader>
        <MainContent style={{ display: 'flex', justifyContent: 'center' }}>
          {children}
        </MainContent>
      </Main>
    </Screen>
  );
}

export function ScannerDoubleFeedCalibrationScreen(): JSX.Element | null {
  const scannerStatusQuery = getScannerStatus.useQuery({
    refetchInterval: POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
  });
  const endDoubleFeedCalibrationMutation =
    endDoubleFeedCalibration.useMutation();

  /* istanbul ignore next - @preserve */
  if (!scannerStatusQuery.isSuccess) return null;
  const status = scannerStatusQuery.data;

  /* istanbul ignore next - @preserve */
  assert(
    status.state === 'calibrating_double_feed_detection.double_sheet' ||
      status.state === 'calibrating_double_feed_detection.single_sheet' ||
      status.state === 'calibrating_double_feed_detection.done' ||
      status.state === 'paused'
  );

  switch (status.state) {
    case 'calibrating_double_feed_detection.double_sheet': {
      return (
        <CalibrationScreen>
          <FullScreenMessage
            title="Insert Two Blank Sheets"
            image={<DoubleFeedCalibrationDoubleSheetIllustration />}
          >
            <P>
              Stack two blank sheets on top of each other and feed them into the
              scanner.
            </P>
          </FullScreenMessage>
        </CalibrationScreen>
      );
    }

    case 'calibrating_double_feed_detection.single_sheet': {
      return (
        <CalibrationScreen>
          <FullScreenMessage
            title="Insert One Blank Sheet"
            image={<DoubleFeedCalibrationSingleSheetIllustration />}
          >
            <P>Feed a single blank calibration sheet into the scanner.</P>
          </FullScreenMessage>
        </CalibrationScreen>
      );
    }

    // After hitting the close button, the scanner goes back to the paused state
    // momentarily before this screen unmounts
    case 'paused':
    case 'calibrating_double_feed_detection.done': {
      const closeButton = (
        <Button
          onPress={() => {
            endDoubleFeedCalibrationMutation.mutate();
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
                status.error === 'double_feed_calibration_timed_out'
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

    /* istanbul ignore next - @preserve */
    default:
      throwIllegalValue(status.state);
  }
}
