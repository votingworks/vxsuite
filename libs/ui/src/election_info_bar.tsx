import React from 'react';

import {
  ElectionDefinition,
  formatElectionHashes,
  PrecinctSelection,
} from '@votingworks/types';
import styled from 'styled-components';
import { assertDefined } from '@votingworks/basics';
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
  flex: 1;
  display: flex;
  flex-wrap: nowrap;
  gap: 0.75rem;
  justify-content: flex-end;
`;

export type InfoBarMode = 'voter' | 'pollworker' | 'admin';

export interface ElectionInfoBarProps {
  mode?: InfoBarMode;
  electionDefinition?: ElectionDefinition;
  electionPackageHash?: string;
  codeVersion?: string;
  machineId?: string;
  precinctSelection?: PrecinctSelection;
  inverse?: boolean;
}
export function ElectionInfoBar({
  mode = 'voter',
  electionDefinition,
  electionPackageHash,
  codeVersion,
  machineId,
  precinctSelection,
  inverse,
}: ElectionInfoBarProps): JSX.Element {
  const codeVersionInfo =
    mode !== 'voter' && codeVersion ? (
      <Caption noWrap>
        <LabelledText label="Version">
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

  if (!electionDefinition) {
    return (
      <Bar data-testid="electionInfoBar" inverse={inverse}>
        <SystemInfoContainer>
          {codeVersionInfo}
          {machineIdInfo}
        </SystemInfoContainer>
      </Bar>
    );
  }

  const {
    election,
    election: { precincts, county, seal },
  } = electionDefinition;

  const electionInfoLabel = (
    <Font maxLines={2}>
      {precinctSelection && (
        <React.Fragment>
          <PrecinctSelectionName
            electionPrecincts={precincts}
            precinctSelection={precinctSelection}
          />
          ,{' '}
        </React.Fragment>
      )}
      {electionStrings.countyName(county)},{' '}
      {electionStrings.stateName(election)}
    </Font>
  );

  const electionInfo = (
    <Caption weight="regular">
      <LabelledText labelPosition="bottom" label={electionInfoLabel}>
        <Font weight="bold">{electionStrings.electionTitle(election)}</Font> —{' '}
        <Font noWrap>{electionStrings.electionDate(election)}</Font>
      </LabelledText>
    </Caption>
  );

  const electionIdInfo = (
    <Caption>
      <LabelledText label="Election ID">
        <Font weight="bold">
          {formatElectionHashes(
            electionDefinition.ballotHash,
            assertDefined(electionPackageHash)
          )}
        </Font>
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
  electionPackageHash,
  codeVersion,
  machineId,
  precinctSelection,
  inverse,
}: ElectionInfoBarProps): JSX.Element {
  if (!electionDefinition) {
    return (
      <VerticalBar inverse={inverse}>
        <Caption>
          {mode !== 'voter' && codeVersion && (
            <div>
              Version: <Font weight="semiBold">{codeVersion}</Font>
            </div>
          )}

          {mode !== 'voter' && machineId && (
            <div>
              Machine ID: <Font weight="semiBold">{machineId}</Font>
            </div>
          )}
        </Caption>
      </VerticalBar>
    );
  }
  const {
    election,
    election: { precincts, county, seal },
  } = electionDefinition;

  return (
    <VerticalBar inverse={inverse}>
      <ElectionInfoContainer>
        <Seal seal={seal} maxWidth="3rem" inverse={inverse} />

        <Caption weight="regular" align="left">
          <Font weight="bold" maxLines={4}>
            {electionStrings.electionTitle(election)}
          </Font>
          {precinctSelection && (
            <Font maxLines={4}>
              <PrecinctSelectionName
                electionPrecincts={precincts}
                precinctSelection={precinctSelection}
              />
            </Font>
          )}

          <div>
            <Font maxLines={4}>
              {electionStrings.countyName(county)},{' '}
              {electionStrings.stateName(election)}
            </Font>
          </div>

          <div>{electionStrings.electionDate(election)}</div>
        </Caption>
      </ElectionInfoContainer>

      <Caption>
        {mode !== 'voter' && codeVersion && (
          <div>
            Version: <Font weight="semiBold">{codeVersion}</Font>
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
            {formatElectionHashes(
              electionDefinition.ballotHash,
              assertDefined(electionPackageHash)
            )}
          </Font>
        </div>
      </Caption>
    </VerticalBar>
  );
}
