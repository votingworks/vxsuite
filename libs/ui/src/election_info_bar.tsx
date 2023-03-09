/* stylelint-disable order/properties-order, value-keyword-case, order/order */
import React from 'react';

import {
  ElectionDefinition,
  getDisplayElectionHash,
  PrecinctSelection,
} from '@votingworks/types';
import { formatShortDate, getPrecinctSelectionName } from '@votingworks/utils';
import styled from 'styled-components';
import { DateTime } from 'luxon';
import { NoWrap } from './text';
import { Seal } from './seal';
import { Caption, Font, P } from './typography';
import { LabelledText } from './labelled_text';

const Bar = styled.div`
  align-content: flex-end;
  align-items: center;
  display: flex;
  border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.foreground};
  padding: 0.125rem 0.125rem;
  gap: 0.5rem;
  justify-content: space-between;
`;

const PrecinctInfoContainer = styled.div`
  align-items: center;
  display: flex;
  gap: 0.25rem;
  justify-content: space-between;
`;

const SealContainer = styled.div`
  width: 2.25rem;
`;

const SystemInfoContainer = styled.div`
  align-content: flex-end;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  flex-grow: 1;
  gap: 0.5rem;
  justify-content: end;
  text-align: right;
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
      <PrecinctInfoContainer>
        <SealContainer>
          {(seal || sealUrl) && <Seal seal={seal} sealUrl={sealUrl} />}
        </SealContainer>
        <Caption weight="regular">
          <LabelledText
            label={
              <React.Fragment>
                <Font weight="bold">{title}</Font> —{' '}
                <NoWrap>{electionDate}</NoWrap>
              </React.Fragment>
            }
          >
            {precinctSelection && (
              <React.Fragment>
                <NoWrap>
                  {getPrecinctSelectionName(precincts, precinctSelection)},
                </NoWrap>{' '}
              </React.Fragment>
            )}
            <NoWrap>{county.name},</NoWrap> <NoWrap>{state}</NoWrap>
          </LabelledText>
        </Caption>
      </PrecinctInfoContainer>
      <SystemInfoContainer>
        {mode !== 'voter' && codeVersion && (
          <Caption noWrap weight="bold">
            <LabelledText label="Software Version">{codeVersion}</LabelledText>
          </Caption>
        )}
        {mode !== 'voter' && machineId && (
          <Caption noWrap weight="bold">
            <LabelledText label="Machine ID">{machineId}</LabelledText>
          </Caption>
        )}
        <Caption weight="bold">
          <LabelledText label="Election ID">
            {getDisplayElectionHash(electionDefinition)}
          </LabelledText>
        </Caption>
      </SystemInfoContainer>
    </Bar>
  );
}
