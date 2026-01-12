import React from 'react';
import { Button, Main, Screen, H1, P } from '@votingworks/ui';
import type { Anomaly } from '@votingworks/pollbook-backend';
import { throwIllegalValue } from '@votingworks/basics';
import { dismissAnomaly } from './api';

export interface AnomalyAlertScreenProps {
  anomaly: Anomaly;
}

export function AnomalyAlertScreen({
  anomaly,
}: AnomalyAlertScreenProps): JSX.Element {
  const dismissAnomalyMutation = dismissAnomaly.useMutation();

  async function handleDismiss() {
    await dismissAnomalyMutation.mutateAsync({ anomalyId: anomaly.anomalyId });
  }

  function getAnomalyTitle(): string {
    switch (anomaly.anomalyType) {
      case 'DuplicateCheckIn':
        return 'Duplicate Check-In Detected';
      default:
        /* istanbul ignore next - @preserve */
        throwIllegalValue(anomaly.anomalyType);
    }
  }

  function getAnomalyContent(): JSX.Element {
    switch (anomaly.anomalyType) {
      case 'DuplicateCheckIn': {
        const details = anomaly.anomalyDetails;
        return (
          <React.Fragment>
            <P>
              <strong>Voter ID:</strong> {details.voterId}
            </P>
            <P>{details.message}</P>
            <P>
              Please verify the voter&apos;s check-in status and take
              appropriate action if needed. Only one check-in for this voter
              will be counted. If the wrong voter was checked in, please
              check-in the missing voter.
            </P>
          </React.Fragment>
        );
      }
      default:
        /* istanbul ignore next - @preserve */
        throwIllegalValue(anomaly.anomalyType);
    }
  }

  return (
    <Screen>
      <Main centerChild>
        <div style={{ textAlign: 'center', maxWidth: '600px' }}>
          <H1>{getAnomalyTitle()}</H1>
          {getAnomalyContent()}
          <P>
            <Button
              variant="primary"
              onPress={handleDismiss}
              disabled={dismissAnomalyMutation.isLoading}
            >
              Acknowledge
            </Button>
          </P>
        </div>
      </Main>
    </Screen>
  );
}
