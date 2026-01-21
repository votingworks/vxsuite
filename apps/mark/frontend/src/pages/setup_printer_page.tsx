import React from 'react';
import {
  appStrings,
  Icons,
  P,
  ToggleUsbPortsButton,
  useAudioControls,
  useAudioEnabled,
  useSystemCallApi,
} from '@votingworks/ui';
import {
  CenteredCardPageLayout,
  PollWorkerPrompt,
} from '@votingworks/mark-flow-ui';
import type { PollsState } from '@votingworks/types';
import { useAlarm } from '../utils/use_alarm';

export interface SetupPrinterPageProps {
  isPollWorkerAuth?: boolean;
  isCardlessVoterAuth?: boolean;
  pollsState?: PollsState;
}

export function SetupPrinterPage({
  isPollWorkerAuth,
  isCardlessVoterAuth,
  pollsState,
}: SetupPrinterPageProps): JSX.Element {
  const wasAudioEnabled = React.useRef(useAudioEnabled());
  const { setIsEnabled: setAudioEnabled } = useAudioControls();

  // USB port management
  const systemCallApi = useSystemCallApi();
  const usbPortStatusQuery = systemCallApi.getUsbPortStatus.useQuery();
  const toggleUsbPortsMutation = systemCallApi.toggleUsbPorts.useMutation();
  const areUsbPortsEnabled = usbPortStatusQuery.data?.enabled ?? true;

  // Track if we've auto-disabled during this alarm session
  const hasAutoDisabledRef = React.useRef(false);

  // Play alarm when polls are open or paused (active voting period) and no authorized user present
  const shouldPlayAlarm =
    !isPollWorkerAuth &&
    (pollsState === 'polls_open' || pollsState === 'polls_paused');

  // Play alarm through system speakers (not headphones) via backend
  useAlarm(shouldPlayAlarm);

  // Auto-disable USB ports when entering alarm state for security
  // Wait for USB port status query to load before making any decisions
  const usbPortStatusLoaded = usbPortStatusQuery.isSuccess;
  React.useEffect(() => {
    if (
      shouldPlayAlarm &&
      usbPortStatusLoaded &&
      areUsbPortsEnabled &&
      !hasAutoDisabledRef.current
    ) {
      toggleUsbPortsMutation.mutate({ action: 'disable' });
      hasAutoDisabledRef.current = true;
    }

    // Reset the flag when alarm stops (e.g., poll worker auth or printer reconnects)
    if (!shouldPlayAlarm) {
      hasAutoDisabledRef.current = false;
    }
  }, [
    shouldPlayAlarm,
    usbPortStatusLoaded,
    areUsbPortsEnabled,
    toggleUsbPortsMutation,
  ]);

  // Disable TTS audio while alarm is playing to avoid confusion
  React.useEffect(() => {
    if (!shouldPlayAlarm) return;

    setAudioEnabled(false);

    function restoreAudioOnExit() {
      setAudioEnabled(wasAudioEnabled.current);
    }
    return restoreAudioOnExit;
  }, [setAudioEnabled, shouldPlayAlarm]);

  // Voter-facing alarm state when there's an active cardless voter session
  if (shouldPlayAlarm) {
    return (
      <CenteredCardPageLayout
        icon={<Icons.Danger color="danger" />}
        title={appStrings.noteNoPrinterConnected()}
        voterFacing={Boolean(isCardlessVoterAuth)}
      >
        <P>{appStrings.instructionsAskForHelp()}</P>
        <PollWorkerPrompt>
          Insert a poll worker card to silence the alert. Connect the printer to
          resume voting.
        </PollWorkerPrompt>
      </CenteredCardPageLayout>
    );
  }

  return (
    <CenteredCardPageLayout
      icon={<Icons.Danger color="danger" />}
      title={appStrings.noteNoPrinterConnected()}
      voterFacing={false}
    >
      <P>Connect the printer to continue.</P>
      {isPollWorkerAuth && !areUsbPortsEnabled && (
        <React.Fragment>
          <P>
            USB ports were automatically disabled for security when the printer
            disconnected during voting.
          </P>
          <ToggleUsbPortsButton onlyShowWhenDisabled />
        </React.Fragment>
      )}
    </CenteredCardPageLayout>
  );
}
