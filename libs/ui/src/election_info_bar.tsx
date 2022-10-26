import React from 'react';

import { ElectionDefinition, PrecinctSelection } from '@votingworks/types';
import { format, getPrecinctSelectionName } from '@votingworks/utils';
import styled from 'styled-components';
import { Prose } from './prose';
import { Text, NoWrap } from './text';
import { contrastTheme, Theme } from './themes';

interface BarProps {
  theme?: Theme;
}

const Bar = styled.div<BarProps>`
  display: flex;
  flex-direction: row;
  align-items: end;
  background: ${({ theme: { background } }) => background};
  padding: 0.5rem 0.75rem;
  color: ${({ theme: { color } }) => color};
  gap: 1rem;
`;

export type InfoBarMode = 'voter' | 'pollworker' | 'admin';

interface Props {
  mode?: InfoBarMode;
  electionDefinition: ElectionDefinition;
  codeVersion: string;
  machineId: string;
  precinctSelection?: PrecinctSelection;
}
export function ElectionInfoBar({
  mode = 'voter',
  electionDefinition,
  codeVersion,
  machineId,
  precinctSelection,
}: Props): JSX.Element {
  const electionDate = format.localeDate(
    new Date(electionDefinition.election.date)
  );

  /* istanbul ignore next */
  const theme: Theme = { ...(contrastTheme.dark ?? {}) };

  return (
    <Bar theme={theme} data-testid="electionInfoBar">
      <Prose maxWidth={false} compact style={{ flex: 1 }}>
        <strong>{electionDefinition.election.title}</strong> —{' '}
        <NoWrap>{electionDate}</NoWrap>
        <Text as="div" small>
          {precinctSelection && (
            <React.Fragment>
              <NoWrap>
                {getPrecinctSelectionName(
                  electionDefinition.election.precincts,
                  precinctSelection
                )}
                ,
              </NoWrap>{' '}
            </React.Fragment>
          )}
          <NoWrap>{electionDefinition.election.county.name},</NoWrap>{' '}
          <NoWrap>{electionDefinition.election.state}</NoWrap>
        </Text>
      </Prose>
      {mode !== 'voter' && (
        <React.Fragment>
          <Prose maxWidth={false} compact textRight>
            <Text as="div" small noWrap>
              Software Version
            </Text>
            <strong>{codeVersion}</strong>
          </Prose>
          <Prose maxWidth={false} compact textRight>
            <Text as="div" small noWrap>
              Machine ID
            </Text>
            <strong>{machineId}</strong>
          </Prose>
        </React.Fragment>
      )}
      <Prose maxWidth={false} compact textRight>
        <Text as="div" small>
          Election ID
        </Text>
        <strong>{electionDefinition.electionHash.slice(0, 10)}</strong>
      </Prose>
    </Bar>
  );
}
