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
  const headphonesPluggedIn = audioInfoQuery.isSuccess
    ? audioInfoQuery.data.headphonesActive
    : false;

  return headphonesPluggedIn;
}
