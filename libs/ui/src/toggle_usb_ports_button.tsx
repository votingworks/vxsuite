import React, { useState } from 'react';

import { Button } from './button';
import { Modal } from './modal';
import { useSystemCallApi } from './system_call_api';
import { P } from './typography';

export function ToggleUsbPortsButton(): JSX.Element {
  const systemCallApi = useSystemCallApi();
  const usbPortStatusQuery = systemCallApi.getUsbPortStatus.useQuery();
  const toggleUsbPortsMutation = systemCallApi.toggleUsbPorts.useMutation();
  const usbPortStatus = usbPortStatusQuery.data;
  const areUsbPortsEnabled = usbPortStatus?.enabled ?? true;
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);

  function disableUsbPorts() {
    toggleUsbPortsMutation.mutate({ action: 'disable' });
  }

  function enableUsbPorts() {
    toggleUsbPortsMutation.mutate({ action: 'enable' });
  }

  function openConfirmationModal() {
    setIsConfirmationModalOpen(true);
  }

  function closeConfirmationModal() {
    setIsConfirmationModalOpen(false);
  }

  return (
    <React.Fragment>
      {areUsbPortsEnabled ? (
        <Button onPress={openConfirmationModal}>Disable USB Ports</Button>
      ) : (
        <Button onPress={enableUsbPorts}>Enable USB Ports</Button>
      )}
      {isConfirmationModalOpen && (
        <Modal
          title="Disable USB Ports"
          content={
            <P>
              While USB ports are disabled, this machine will not recognize USB
              drives. You will not be able to configure the machine for an
              election or export files until USB ports are re-enabled.
            </P>
          }
          actions={
            <React.Fragment>
              <Button
                onPress={() => {
                  disableUsbPorts();
                  closeConfirmationModal();
                }}
                variant="danger"
              >
                Disable USB Ports
              </Button>
              <Button onPress={closeConfirmationModal}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={closeConfirmationModal}
        />
      )}
    </React.Fragment>
  );
}
