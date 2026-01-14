import React from 'react';
import { Button, Main, Screen, H1, P, Table } from '@votingworks/ui';
import type { Anomaly } from '@votingworks/pollbook-backend';
import { throwIllegalValue } from '@votingworks/basics';
import { formatFullDateTimeZone } from '@votingworks/utils';
import { DateTime } from 'luxon';
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
        const { voter } = details;
        const voterName = [
          voter.firstName,
          voter.middleName,
          voter.lastName,
          voter.suffix,
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <React.Fragment>
            <P>
              <strong>Voter ID:</strong> {details.voterId}
            </P>
            <P>
              <strong>Voter Name:</strong> {voterName}
            </P>
            <P>
              <strong>Check-In Records:</strong>
            </P>
            <Table>
              <thead>
                <tr>
                  <th>Machine ID</th>
                  <th>Check-In Time</th>
                </tr>
              </thead>
              <tbody>
                {details.checkInEvents.map((checkIn) => (
                  <tr key={checkIn.machineId}>
                    <td>{checkIn.machineId}</td>
                    <td>
                      {formatFullDateTimeZone(
                        DateTime.fromJSDate(new Date(checkIn.timestamp))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
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
