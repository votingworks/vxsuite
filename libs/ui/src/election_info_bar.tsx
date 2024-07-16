import React from 'react';

import {
  ElectionDefinition,
  getDisplayBallotHash,
  PrecinctSelection,
} from '@votingworks/types';
import styled from 'styled-components';
import { Seal } from './seal';
import { Caption, Font } from './typography';
import { LabelledText } from './labelled_text';
import { electionStrings, PrecinctSelectionName } from './ui_strings';

const Bar = styled.div<{ inverse?: boolean }>`
  background: ${(p) => p.inverse && p.theme.colors.inverseBackground};
  color: ${(p) => p.inverse && p.theme.colors.onInverse};
  align-content: flex-end;
  align-items: center;
  border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.onBackground};
  display: flex;
  gap: 0.5rem;
  justify-content: space-between;
  padding: 0.25rem;
`;

const ElectionInfoContainer = styled.div`
  align-items: center;
  display: flex;
  gap: 0.5rem;
  justify-content: start;
`;

const SystemInfoContainer = styled.div`
  align-content: flex-end;
  display: flex;
  flex-flow: row wrap;
  flex-grow: 1;
  gap: 0.5rem;
  justify-content: end;
  text-align: right;
`;

export type InfoBarMode = 'voter' | 'pollworker' | 'admin';

export interface ElectionInfoBarProps {
  mode?: InfoBarMode;
  electionDefinition: ElectionDefinition;
  codeVersion?: string;
  machineId?: string;
  precinctSelection?: PrecinctSelection;
  inverse?: boolean;
}
export function ElectionInfoBar({
  mode = 'voter',
  electionDefinition,
  codeVersion,
  machineId,
  precinctSelection,
  inverse,
}: ElectionInfoBarProps): JSX.Element {
  const {
    election,
    election: { precincts, county, seal },
  } = electionDefinition;

  const electionInfoLabel = (
    <React.Fragment>
      {precinctSelection && (
        <React.Fragment>
          <Font noWrap>
            <PrecinctSelectionName
              electionPrecincts={precincts}
              precinctSelection={precinctSelection}
            />
            ,
          </Font>{' '}
        </React.Fragment>
      )}
      <Font noWrap>{electionStrings.countyName(county)},</Font>{' '}
      <Font noWrap>{electionStrings.stateName(election)}</Font>
    </React.Fragment>
  );

  const electionInfo = (
    <Caption weight="regular">
      <LabelledText labelPosition="bottom" label={electionInfoLabel}>
        <Font weight="bold">{electionStrings.electionTitle(election)}</Font> —{' '}
        <Font noWrap>{electionStrings.electionDate(election)}</Font>
      </LabelledText>
    </Caption>
  );

  const codeVersionInfo =
    mode !== 'voter' && codeVersion ? (
      <Caption noWrap weight="bold">
        <LabelledText label="Software Version">
          <Font weight="bold">{codeVersion}</Font>
        </LabelledText>
      </Caption>
    ) : null;

  const machineIdInfo =
    mode !== 'voter' && machineId ? (
      <Caption noWrap>
        <LabelledText label="Machine ID">
          <Font weight="bold">{machineId}</Font>
        </LabelledText>
      </Caption>
    ) : null;

  const electionIdInfo = (
    <Caption noWrap>
      <LabelledText label="Election ID">
        <Font weight="bold">{getDisplayBallotHash(electionDefinition)}</Font>
      </LabelledText>
    </Caption>
  );

  return (
    <Bar data-testid="electionInfoBar" inverse={inverse}>
      <ElectionInfoContainer>
        <Seal seal={seal} maxWidth="2.25rem" inverse={inverse} />
        {electionInfo}
      </ElectionInfoContainer>
      <SystemInfoContainer>
        {codeVersionInfo}
        {machineIdInfo}
        {electionIdInfo}
      </SystemInfoContainer>
    </Bar>
  );
}

const VerticalBar = styled.div<{ inverse?: boolean }>`
  background: ${(p) => p.inverse && p.theme.colors.inverseBackground};
  color: ${(p) => p.inverse && p.theme.colors.onInverse};
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

export function VerticalElectionInfoBar({
  mode = 'voter',
  electionDefinition,
  codeVersion,
  machineId,
  precinctSelection,
  inverse,
}: ElectionInfoBarProps): JSX.Element {
  const {
    election,
    election: { precincts, county, seal },
  } = electionDefinition;

  return (
    <VerticalBar inverse={inverse}>
      <ElectionInfoContainer>
        <Seal seal={seal} maxWidth="3rem" inverse={inverse} />

        <Caption weight="regular" align="left">
          <Font weight="bold">{electionStrings.electionTitle(election)}</Font>
          {precinctSelection && (
            <PrecinctSelectionName
              electionPrecincts={precincts}
              precinctSelection={precinctSelection}
            />
          )}

          <div>
            {electionStrings.countyName(county)},{' '}
            {electionStrings.stateName(election)}
          </div>

          <div>{electionStrings.electionDate(election)}</div>
        </Caption>
      </ElectionInfoContainer>

      <Caption>
        {mode !== 'voter' && codeVersion && (
          <div>
            Software Version: <Font weight="semiBold">{codeVersion}</Font>
          </div>
        )}

        {mode !== 'voter' && machineId && (
          <div>
            Machine ID: <Font weight="semiBold">{machineId}</Font>
          </div>
        )}

        <div>
          Election ID:{' '}
          <Font weight="semiBold">
            {getDisplayBallotHash(electionDefinition)}
          </Font>
        </div>
      </Caption>
    </VerticalBar>
  );
}
