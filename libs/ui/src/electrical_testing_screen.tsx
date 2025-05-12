import { iter } from '@votingworks/basics';
import { DateTime } from 'luxon';
import React from 'react';
import styled from 'styled-components';
import { Button } from './button';
import { Card } from './card';
import { Icons } from './icons';
import { Main } from './main';
import { Screen } from './screen';
import { Caption, H6 } from './typography';

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

const Small = styled.span`
  font-size: 0.45rem;
`;

const SmallButton = styled(Button)`
  transform: scale(0.5);
`;

const ExtraSmall = styled.span`
  font-size: 0.3rem;
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

  svg {
    scale: 0.8;
  }
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
    <Card
      style={{
        width: '600px',
        height: '235px',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <Row style={{ height: '100%', alignItems: 'stretch' }}>
        <Column style={{ flexGrow: 1 }}>
          <H6 style={{ flexGrow: 0 }}>{title}</H6>
          {statusMessage && (
            <Caption
              style={{
                flexGrow: 1,
                overflowWrap: 'anywhere',
                maxHeight: '2rem',
                overflow: 'hidden',
              }}
            >
              <Small>{statusMessage}</Small>
            </Caption>
          )}
          {body && <Caption style={{ flexGrow: 1 }}>{body}</Caption>}
          {updatedAt && (
            <Caption style={{ flexGrow: 0 }}>
              <ExtraSmall>{formatTimestamp(updatedAt)}</ExtraSmall>
            </Caption>
          )}
        </Column>
        {typeof isRunning === 'boolean' && onToggleRunning && (
          <Column style={{ flexGrow: 0, alignContent: 'center' }}>
            <PlayPauseButton isRunning={isRunning} onPress={onToggleRunning} />
          </Column>
        )}
      </Row>
    </Card>
  );
}

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
  perRow,
  modals,
  powerDown,
}: {
  tasks: ReadonlyArray<Task<Id>>;
  perRow: number;
  modals?: React.ReactNode;
  powerDown: () => void;
}): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <Column style={{ height: '100%' }}>
          <Column
            style={{
              alignItems: 'center',
              gap: '1rem',
              justifyContent: 'center',
            }}
          >
            {iter(tasks)
              .chunks(perRow)
              .map((tt) => (
                <Row gap="1rem" key={tt.map((t) => t.id).join('-')}>
                  {tt.map((t) => (
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
                </Row>
              ))
              .toArray()}
          </Column>
          <Row style={{ justifyContent: 'center' }}>
            <SmallButton icon={<Icons.PowerOff />} onPress={powerDown}>
              Power Off
            </SmallButton>
          </Row>
        </Column>
        {modals}
      </Main>
    </Screen>
  );
}
