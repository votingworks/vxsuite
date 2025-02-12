import styled from 'styled-components';
import { Caption, Font, LabelledText, DateString, Seal } from '@votingworks/ui';
import type { Election } from '@votingworks/pollbook-backend';

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

export interface ElectionInfoBarProps {
  election?: Election;
  codeVersion?: string;
  machineId?: string;
  inverse?: boolean;
}
export function ElectionInfoBar({
  election,
  codeVersion,
  machineId,
  inverse,
}: ElectionInfoBarProps): JSX.Element {
  const codeVersionInfo = codeVersion ? (
    <Caption noWrap>
      <LabelledText label="Version">
        <Font weight="bold">{codeVersion}</Font>
      </LabelledText>
    </Caption>
  ) : null;

  const machineIdInfo = machineId ? (
    <Caption noWrap>
      <LabelledText label="Machine ID">
        <Font weight="bold">{machineId}</Font>
      </LabelledText>
    </Caption>
  ) : null;

  if (!election) {
    return (
      <Bar data-testid="electionInfoBar" inverse={inverse}>
        <SystemInfoContainer>
          {codeVersionInfo}
          {machineIdInfo}
        </SystemInfoContainer>
      </Bar>
    );
  }

  const electionInfoLabel = (
    <Font maxLines={2}>
      {election.county.name}, {election.state}
    </Font>
  );

  const electionInfo = (
    <Caption weight="regular">
      <LabelledText labelPosition="bottom" label={electionInfoLabel}>
        <Font weight="bold">{election.title}</Font> —{' '}
        <Font noWrap>
          <DateString
            value={election.date.toMidnightDatetimeWithSystemTimezone()}
          />
        </Font>
      </LabelledText>
    </Caption>
  );

  const electionIdInfo = (
    <Caption>
      <LabelledText label="Election ID">
        <Font weight="bold">{election.id}</Font>
      </LabelledText>
    </Caption>
  );

  return (
    <Bar data-testid="electionInfoBar" inverse={inverse}>
      <ElectionInfoContainer>
        <Seal seal={election.seal} maxWidth="2.25rem" inverse={inverse} />
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
  election,
  codeVersion,
  machineId,
  inverse,
}: ElectionInfoBarProps): JSX.Element {
  if (!election) {
    return (
      <VerticalBar inverse={inverse}>
        <Caption>
          {codeVersion && (
            <div>
              Version: <Font weight="semiBold">{codeVersion}</Font>
            </div>
          )}

          {machineId && (
            <div>
              Machine ID: <Font weight="semiBold">{machineId}</Font>
            </div>
          )}
        </Caption>
      </VerticalBar>
    );
  }

  return (
    <VerticalBar inverse={inverse}>
      <ElectionInfoContainer>
        <Seal seal={election.seal} maxWidth="3rem" inverse={inverse} />

        <Caption weight="regular" align="left">
          <Font weight="bold" maxLines={4}>
            {election.title}
          </Font>
          <Font maxLines={4}>
            {election.county.name}, {election.state}
          </Font>
          <div>
            <DateString
              value={election.date.toMidnightDatetimeWithSystemTimezone()}
            />
          </div>
        </Caption>
      </ElectionInfoContainer>

      <Caption>
        {codeVersion && (
          <div>
            Version: <Font weight="semiBold">{codeVersion}</Font>
          </div>
        )}

        {machineId && (
          <div>
            Machine ID: <Font weight="semiBold">{machineId}</Font>
          </div>
        )}

        <div>
          Election ID:
          <Font weight="semiBold">{election.id}</Font>
        </div>
      </Caption>
    </VerticalBar>
  );
}
