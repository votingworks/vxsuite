import React from 'react';

import { ElectionDefinition, PrecinctSelection } from '@votingworks/types';
import { formatShortDate, getPrecinctSelectionName } from '@votingworks/utils';
import styled from 'styled-components';
import { DateTime } from 'luxon';
import { Prose } from './prose';
import { Text, NoWrap } from './text';
import { contrastTheme, Theme } from './themes';
import { Seal } from './seal';

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
  codeVersion?: string;
  machineId?: string;
  precinctSelection?: PrecinctSelection;
}
export function ElectionInfoBar({
  mode = 'voter',
  electionDefinition,
  codeVersion,
  machineId,
  precinctSelection,
}: Props): JSX.Element {
  const {
    election: { precincts, date, title, county, state, seal, sealUrl },
  } = electionDefinition;
  const electionDate = formatShortDate(DateTime.fromISO(date));

  /* istanbul ignore next */
  const theme: Theme = { ...(contrastTheme.dark ?? {}) };

  return (
    <Bar theme={theme} data-testid="electionInfoBar">
      {(seal || sealUrl) && <Seal seal={seal} sealUrl={sealUrl} />}
      <Prose maxWidth={false} compact style={{ flex: 1 }}>
        <strong>{title}</strong> — <NoWrap>{electionDate}</NoWrap>
        <Text as="div" small>
          {precinctSelection && (
            <React.Fragment>
              <NoWrap>
                {getPrecinctSelectionName(precincts, precinctSelection)},
              </NoWrap>{' '}
            </React.Fragment>
          )}
          <NoWrap>{county.name},</NoWrap> <NoWrap>{state}</NoWrap>
        </Text>
      </Prose>
      {mode !== 'voter' && codeVersion && (
        <Prose maxWidth={false} compact textRight>
          <Text as="div" small noWrap>
            Software Version
          </Text>
          <strong>{codeVersion}</strong>
        </Prose>
      )}
      {mode !== 'voter' && machineId && (
        <Prose maxWidth={false} compact textRight>
          <Text as="div" small noWrap>
            Machine ID
          </Text>
          <strong>{machineId}</strong>
        </Prose>
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
