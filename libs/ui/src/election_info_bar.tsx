import React from 'react';

import { ElectionDefinition, PrecinctSelection } from '@votingworks/types';
import { format, getPrecinctSelectionName } from '@votingworks/utils';
import { Prose } from './prose';
import { Text, NoWrap } from './text';
import { contrastTheme, Theme } from './themes';
import { Bar, BarSpacer } from './bar';

export type InfoBarMode = 'voter' | 'pollworker' | 'admin';

interface Props {
  mode?: InfoBarMode;
  electionDefinition?: ElectionDefinition;
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
  if (!electionDefinition) {
    return <React.Fragment />;
  }
  const electionDate = format.localeWeekdayAndDate(
    new Date(electionDefinition.election.date)
  );

  /* istanbul ignore next */
  const theme: Theme = { ...(contrastTheme.dark ?? {}) };

  return (
    <Bar theme={theme}>
      <Prose maxWidth={false} compact>
        <NoWrap as="strong">{electionDefinition.election.title}</NoWrap> —{' '}
        <NoWrap>{electionDate}</NoWrap>
        <Text as="div" small>
          {precinctSelection && (
            <React.Fragment>
              <NoWrap>
                {getPrecinctSelectionName(
                  electionDefinition.election.precincts,
                  precinctSelection
                )}
              </NoWrap>{' '}
              —{' '}
            </React.Fragment>
          )}
          <NoWrap>
            {electionDefinition.election.county.name},{' '}
            {electionDefinition.election.state}
          </NoWrap>
        </Text>
      </Prose>
      <BarSpacer />
      {mode !== 'voter' && (
        <React.Fragment>
          <Prose maxWidth={false} compact textRight>
            <Text as="div" small>
              Software Version
            </Text>
            <strong>{codeVersion}</strong>
          </Prose>
          <Prose maxWidth={false} compact textRight>
            <Text as="div" small>
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
