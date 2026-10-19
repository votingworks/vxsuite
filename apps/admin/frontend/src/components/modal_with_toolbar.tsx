import React from 'react';
import styled from 'styled-components';
import type { BatteryInfo } from '@votingworks/backend';
import {
  BatteryStatus,
  DateTimeDisplay,
  LockMachineButton,
  Modal,
  type ModalProps,
  Toolbar,
  ToolbarButtons,
} from '@votingworks/ui';

// During the backup and restore flows, which are a modal that takes over the
// screen, we still want to show the usual toolbar at the top so that users can
// lock the machine (if it's taking a while). We also include basic status info
// (battery, time), but not the full toolbar.

const FixedToolbar = styled(Toolbar)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
`;

interface ToolbarProps {
  batteryInfo?: BatteryInfo | null;
  onLock: () => void;
}

function FlowToolbar({ batteryInfo, onLock }: ToolbarProps): JSX.Element {
  return (
    <FixedToolbar>
      {batteryInfo && <BatteryStatus batteryInfo={batteryInfo} />}
      <DateTimeDisplay />
      <ToolbarButtons>
        <LockMachineButton onLock={onLock} />
      </ToolbarButtons>
    </FixedToolbar>
  );
}

export function ModalWithToolbar({
  batteryInfo,
  onLock,
  content,
  ...props
}: ModalProps & ToolbarProps): JSX.Element {
  // A bit of an odd approach here: we render the toolbar inside the modal
  // content, but use CSS to fix it to the top of the screen. This has the
  // advantage that it automatically renders above the modal's overlay, avoiding
  // any z-index issues.
  return (
    <Modal
      {...props}
      content={
        <React.Fragment>
          <FlowToolbar batteryInfo={batteryInfo} onLock={onLock} />
          {content}
        </React.Fragment>
      }
    />
  );
}
