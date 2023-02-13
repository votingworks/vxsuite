import React from 'react';

import {
  ElectionDefinition,
  getDisplayElectionHash,
  PrecinctSelection,
} from '@votingworks/types';
import { formatShortDate, getPrecinctSelectionName } from '@votingworks/shared';
import styled from 'styled-components';
import { DateTime } from 'luxon';
import { Prose } from './prose';
import { Text, NoWrap } from './text';
import { contrastTheme } from './themes';
import { Seal } from './seal';

const Bar = styled.div`
  display: flex;
  flex-direction: row;
  align-items: end;
  background: ${contrastTheme.dark.background};
  padding: 0.5rem 0.75rem;
  color: ${contrastTheme.dark.color};
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

  return (
    <Bar data-testid="electionInfoBar">
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
        <strong>{getDisplayElectionHash(electionDefinition)}</strong>
      </Prose>
    </Bar>
  );
}
