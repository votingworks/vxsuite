import { useState } from 'react';
import { throwIllegalValue } from '@votingworks/basics';
import {
  Button,
  FullScreenIconWrapper,
  Icons,
  Loading,
  Modal,
  P,
  appStrings,
} from '@votingworks/ui';

import { exportCastVoteRecordsToUsbDrive } from '../api';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';
import { ScreenMainCenterChild } from '../components/layout';

const CAST_VOTE_RECORD_SYNC_REQUIRED_PROMPT =
  'The inserted USB drive does not contain up-to-date records of the votes cast at this scanner. ' +
  'Cast vote records (CVRs) need to be synced to the USB drive.';

type ModalState = 'closed' | 'syncing' | 'success' | 'error';

interface Props {
  setShouldStayOnCastVoteRecordSyncRequiredScreen: (
    shouldStayOnCastVoteRecordSyncRequiredScreen: boolean
  ) => void;
  isAuthenticated: boolean;
}

export function CastVoteRecordSyncRequiredVoterScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild voterFacing={false}>
      <FullScreenPromptLayout
        title={appStrings.titleScannerCvrSyncRequired()}
        image={
          <FullScreenIconWrapper>
            <Icons.Warning color="warning" />
          </FullScreenIconWrapper>
        }
      >
        <P>{appStrings.warningCvrsNeedSync()}</P>
        {/* Poll-worker-facing string - not translated: */}
        <P>Insert a poll worker card to continue.</P>
      </FullScreenPromptLayout>
    </ScreenMainCenterChild>
  );
}

export function CastVoteRecordSyncRequiredScreen({
  setShouldStayOnCastVoteRecordSyncRequiredScreen,
  isAuthenticated,
}: Props): JSX.Element {
  const exportCastVoteRecordsToUsbDriveMutation =
    exportCastVoteRecordsToUsbDrive.useMutation();

  const [modalState, setModalState] = useState<ModalState>('closed');

  function syncCastVoteRecords() {
    setShouldStayOnCastVoteRecordSyncRequiredScreen(true);
    setModalState('syncing');
    exportCastVoteRecordsToUsbDriveMutation.mutate(
      { mode: 'recovery_export' },
      {
        onSuccess: (result) => {
          if (result.isErr()) {
            setModalState('error');
            return;
          }
          setModalState('success');
        },
      }
    );
  }

  function closeModal() {
    setModalState('closed');
    setShouldStayOnCastVoteRecordSyncRequiredScreen(false);
  }

  const modal = (() => {
    switch (modalState) {
      case 'closed': {
        return null;
      }
      case 'syncing': {
        return <Modal content={<Loading>Syncing CVRs</Loading>} />;
      }
      case 'error': {
        return (
          <Modal
            title="CVR Sync Error"
            content={<P>Try inserting a different USB drive.</P>}
            actions={<Button onPress={closeModal}>Close</Button>}
            onOverlayClick={closeModal}
          />
        );
      }
      case 'success': {
        return (
          <Modal
            title="CVR Sync Complete"
            content={<P>Voters may continue casting ballots.</P>}
            actions={<Button onPress={closeModal}>Close</Button>}
            onOverlayClick={closeModal}
          />
        );
      }
      /* istanbul ignore next: Compile-time check for completeness */
      default: {
        throwIllegalValue(modalState);
      }
    }
  })();

  if (!isAuthenticated) {
    return <CastVoteRecordSyncRequiredVoterScreen />;
  }

  return (
    <ScreenMainCenterChild voterFacing={false}>
      <FullScreenPromptLayout
        title="CVR Sync Required"
        image={
          <FullScreenIconWrapper>
            <Icons.Warning color="warning" />
          </FullScreenIconWrapper>
        }
      >
        <P>{CAST_VOTE_RECORD_SYNC_REQUIRED_PROMPT}</P>
        <P>
          <Button variant="primary" onPress={syncCastVoteRecords}>
            Sync CVRs
          </Button>
        </P>
      </FullScreenPromptLayout>
      {modal}
    </ScreenMainCenterChild>
  );
}
