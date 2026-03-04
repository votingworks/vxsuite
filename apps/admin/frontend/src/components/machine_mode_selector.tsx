import { useContext } from 'react';
import { Card, H2, SegmentedButton } from '@votingworks/ui';
import type { VxAdminMachineMode } from '@votingworks/admin-backend';
import { setMachineMode } from '../api';
import { AppContext } from '../contexts/app_context';

const MACHINE_MODE_OPTIONS: Array<{
  id: VxAdminMachineMode;
  label: string;
}> = [
  { id: 'traditional', label: 'Traditional' },
  { id: 'host', label: 'Host' },
  { id: 'client', label: 'Client' },
];

export function MachineModeSelector(): JSX.Element {
  const { machineMode } = useContext(AppContext);
  const setMachineModeMutation = setMachineMode.useMutation();

  return (
    <Card>
      <H2>Machine Mode</H2>
      <SegmentedButton
        label="Machine Mode"
        hideLabel
        options={MACHINE_MODE_OPTIONS}
        selectedOptionId={machineMode}
        onChange={(newMode) => {
          setMachineModeMutation.mutate({ mode: newMode });
        }}
      />
    </Card>
  );
}
