import styled from 'styled-components';
import { Card, H3, Icons } from '@votingworks/ui';
import { format } from '@votingworks/utils';
import type { BackupManifestStruct } from '@votingworks/admin-backend';

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
  manifest,
}: {
  manifest: BackupManifestStruct;
}): JSX.Element {
  const { election } = manifest;
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
            {format.count(manifest.cvrCount)}{' '}
            {manifest.cvrCount === 1 ? 'CVR' : 'CVRs'}
          </div>
          <MutedText>
            Machine {manifest.machineId} ·{' '}
            {format.localeShortDateAndTime(new Date(manifest.createdAt))}
          </MutedText>
        </BackupDetailsContent>
      </div>
    </Card>
  );
}
