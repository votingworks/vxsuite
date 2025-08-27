import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { assertDefined } from '@votingworks/basics';
import { useSystemCallApi } from '../system_call_api';

function useOptionalSystemCallApi() {
  try {
    return useSystemCallApi();
  } catch {
    return undefined;
  }
}

export function useHeadphonesPluggedIn(): boolean {
  const systemCallApi = useOptionalSystemCallApi();

  // Simulate always-plugged-in headphones if we're bypassing the check for
  // development/testing purposes:
  if (
    !isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.ONLY_ENABLE_SCREEN_READER_FOR_HEADPHONES
    )
  ) {
    return true;
  }

  const { getAudioInfo } = assertDefined(
    systemCallApi,
    'SystemCall API context not provided'
  );

  const audioInfoQuery = getAudioInfo.useQuery();
  if (!audioInfoQuery.isSuccess) return false;

  // VxScan: headphone audio provided via always-connected USB tactile
  // controller.
  if (audioInfoQuery.data.usb) return true;

  // VxMarkScan: headphone audio provided through headphone port on builtin
  // audio card.
  if (audioInfoQuery.data.builtin) {
    return audioInfoQuery.data.builtin.headphonesActive;
  }

  return false;
}
