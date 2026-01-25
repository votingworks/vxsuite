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
      case 'InvalidRegistrationCheckIn':
        return 'Check-In for Deleted Voter';
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
            <P>This voter was checked in more than once.</P>
            <P>
              <strong>Voter ID:</strong> {details.voterId}
            </P>
            <P>
              <strong>Voter Name:</strong> {voterName}
            </P>
            <P>
              <strong>Check-In Records</strong>
            </P>
            <Table style={{ margin: '1em 0' }}>
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
              Only one check-in for this voter will count toward the check-in
              total. If this occurred because two different voters were checked
              in under the same record, please check in the missing voter.
            </P>
          </React.Fragment>
        );
      }
      case 'InvalidRegistrationCheckIn': {
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
              A check-in was detected for a voter whose registration was
              deleted.
            </P>
            <P>
              <strong>Voter ID:</strong> {details.voterId}
            </P>
            <P>
              <strong>Voter Name:</strong> {voterName}
            </P>
            <P>
              The check-in will be counted. An election manager should undo the
              check-in if this was done in error.
            </P>
            <Table style={{ margin: '1em 0' }}>
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
        <div style={{ maxWidth: '800px' }}>
          <H1>{getAnomalyTitle()}</H1>
          {getAnomalyContent()}
          <P style={{ marginTop: '1em' }}>
            <Button
              variant="primary"
              onPress={handleDismiss}
              disabled={dismissAnomalyMutation.isLoading}
            >
              Dismiss
            </Button>
          </P>
        </div>
      </Main>
    </Screen>
  );
}
