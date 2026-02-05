import React, { useEffect } from 'react';

import { useAudioControls, useAudioEnabled } from '@votingworks/ui';
import { useMutation } from '@tanstack/react-query';
import * as api from '../api';

export function useAlarm(enableAlarm: boolean): void {
  const { setIsEnabled: setTtsEnabled } = useAudioControls();
  const ttsWasEnabled = React.useRef(useAudioEnabled());

  const playAlarm = usePlayAlarm().mutate;
  useEffect(() => {
    if (!enableAlarm) return;

    setTtsEnabled(false);
    const enableTtsOnExit = ttsWasEnabled.current;

    const interval = setInterval(() => playAlarm(), 2000);

    return () => {
      clearInterval(interval);
      if (enableTtsOnExit) setTtsEnabled(true);
    };
  }, [enableAlarm, playAlarm, setTtsEnabled]);
}

/**
 * NOTE: {@link api.playSound} mutes/unmutes TTS while playing sounds, but it's
 * being called here at long enough intervals that the screen reader kicks in
 * for a bit between alarms, so the logic's duplicated here.
 * [TODO] Could potentially add a `repeat` option to `playSound()`.
 */
function usePlayAlarm() {
  const client = api.useApiClient();
  return useMutation(() => client.playSound({ name: 'alarm' }));
}
