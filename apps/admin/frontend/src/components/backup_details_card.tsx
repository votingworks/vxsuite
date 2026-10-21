import styled from 'styled-components';
import { Card, H3, Icons } from '@votingworks/ui';
import { format } from '@votingworks/utils';
import type { BackupDetails } from '@votingworks/admin-backend';

const BackupDetailsContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  margin-top: -0.125rem;
`;

const BackupIcon = styled(Icons.Backup)`
  font-size: ${(p) => p.theme.sizes.headingsRem.h3}rem;
`;

const MutedText = styled.div`
  color: ${(p) => p.theme.colors.onBackgroundMuted};
`;

export function BackupDetailsCard({
  details,
}: {
  details: BackupDetails;
}): JSX.Element {
  const { election, cvrCount, machineId, createdAt } = details;
  return (
    <Card>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <BackupIcon />
        <BackupDetailsContent>
          <H3 style={{ margin: 0 }}>
            {election.title} ·{' '}
            {format.localeLongDate(
              election.date.toMidnightDatetimeWithSystemTimezone()
            )}
          </H3>
          <div>
            {election.jurisdictionName}, {election.state}
          </div>
          <div>
            {format.count(cvrCount)} {cvrCount === 1 ? 'CVR' : 'CVRs'}
          </div>
          <MutedText>
            Machine {machineId} ·{' '}
            {format.localeShortDateAndTime(new Date(createdAt))}
          </MutedText>
        </BackupDetailsContent>
      </div>
    </Card>
  );
}
