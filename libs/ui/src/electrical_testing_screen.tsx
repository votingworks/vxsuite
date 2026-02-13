import { UsbDriveStatus } from '@votingworks/usb-drive';
import { DateTime } from 'luxon';
import React from 'react';
import styled from 'styled-components';
import { Button } from './button';
import { Card } from './card';
import { Icons } from './icons';
import { Main } from './main';
import { Screen } from './screen';
import { Caption, H6 } from './typography';
import { ExportLogsModal } from './export_logs_modal';
import {
  SignedHashValidationApiClient,
  SignedHashValidationButton,
} from './signed_hash_validation_button';

const Row = styled.div<{ gap?: string }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ gap = 0 }) => gap};
`;

const Column = styled.div<{ gap?: string }>`
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: ${({ gap = 0 }) => gap};
`;

const PlayPauseButtonBase = styled.button`
  flex-shrink: 0;
  background-color: #ddd;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  padding: 0;
`;

function PlayPauseButton({
  isRunning,
  onPress,
}: {
  isRunning: boolean;
  onPress: () => void;
}) {
  return (
    <PlayPauseButtonBase onClick={onPress}>
      {isRunning ? <Icons.Pause /> : <Icons.Play />}
    </PlayPauseButtonBase>
  );
}

function formatTimestamp(timestamp: DateTime): string {
  return timestamp.toLocal().toFormat('h:mm:ss a MM/dd/yyyy');
}

const StatusBody = styled.div`
  display: grid;
  gap: 0.5rem;
  grid-template-rows: 1fr min-content;
`;

function StatusCard({
  title,
  statusMessage,
  body,
  updatedAt,
  isRunning,
  onToggleRunning,
}: {
  title: React.ReactNode;
  statusMessage?: React.ReactNode;
  body?: React.ReactNode;
  updatedAt?: DateTime;
  isRunning?: boolean;
  onToggleRunning?: () => void;
}) {
  return (
    <Card>
      <Row style={{ alignItems: 'baseline' }}>
        <Column>
          <H6 style={{ flexGrow: 0 }}>{title}</H6>
          {statusMessage && <div>{statusMessage}</div>}
        </Column>
        {typeof isRunning === 'boolean' && onToggleRunning && (
          <Column style={{ flexGrow: 0, alignContent: 'center' }}>
            <PlayPauseButton isRunning={isRunning} onPress={onToggleRunning} />
          </Column>
        )}
      </Row>
      <StatusBody>
        <div>{body}</div>
        {updatedAt && (
          <Caption style={{ flexGrow: 0 }}>
            {formatTimestamp(updatedAt)}
          </Caption>
        )}
      </StatusBody>
    </Card>
  );
}

const Cards = styled.div`
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr 1fr;
  padding: 0.5rem;
`;

const Footer = styled.div`
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(2, 1fr);

  > :last-child:nth-child(2n-1) {
    grid-column: 1 / -1;
  }
`;

export interface Task<Id = string> {
  id: Id;
  title: React.ReactNode;
  icon: React.ReactNode;
  body?: React.ReactNode;
  statusMessage?: React.ReactNode;
  updatedAt?: DateTime;
  isRunning?: boolean;
  toggleIsRunning?: () => void;
}

export function ElectricalTestingScreen<Id extends React.Key>({
  tasks,
  modals,
  powerDown,
  usbDriveStatus,
  topOffset,
  apiClient,
}: {
  tasks: ReadonlyArray<Task<Id>>;
  modals?: React.ReactNode;
  powerDown: () => void;
  usbDriveStatus?: UsbDriveStatus;
  /** Optional top offset (e.g., '80px') to account for a fixed top bar */
  topOffset?: string;
  /** API client for signed hash validation */
  apiClient: SignedHashValidationApiClient;
}): JSX.Element {
  const [isSaveLogsModalOpen, setIsSaveLogsModalOpen] = React.useState(false);

  return (
    <Screen>
      <Main style={topOffset ? { paddingTop: topOffset } : undefined} padded>
        <Column style={{ height: '100%' }}>
          <Cards>
            {tasks.map((t) => (
              <StatusCard
                key={t.id}
                title={
                  <React.Fragment>
                    {t.icon} {t.title}
                  </React.Fragment>
                }
                body={t.body}
                statusMessage={t.statusMessage}
                updatedAt={t.updatedAt}
                isRunning={t.isRunning}
                onToggleRunning={t.toggleIsRunning}
              />
            ))}
          </Cards>
          <div style={{ flexGrow: 1 }} /> {/* spacer */}
          <Footer>
            <SignedHashValidationButton apiClient={apiClient} />
            <Button
              icon={<Icons.Save />}
              onPress={() => setIsSaveLogsModalOpen(true)}
            >
              Save Logs
            </Button>
            <Button icon={<Icons.PowerOff />} onPress={powerDown}>
              Power Down
            </Button>
          </Footer>
        </Column>
        {isSaveLogsModalOpen && usbDriveStatus && (
          <ExportLogsModal
            onClose={() => setIsSaveLogsModalOpen(false)}
            usbDriveStatus={usbDriveStatus}
          />
        )}
        {modals}
      </Main>
    </Screen>
  );
}
