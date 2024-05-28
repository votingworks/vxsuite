import React from 'react';

import { useIsPatDeviceConnected } from './pat_device_context';

interface AssistiveTechInstructionsProps {
  controllerString: React.ReactNode;
  patDeviceString: React.ReactNode;
}

/**
 * Renders either the given controller-specific audio string or the given PAT
 * device-specific audio string, based on the PAT device connection state
 * provided by `@votingworks/ui/PatDeviceContextProvider`.
 *
 * Defaults to the controller-specific audio string if there's no
 * `PatDeviceContext` available.
 */
export function AssistiveTechInstructions(
  props: AssistiveTechInstructionsProps
): React.ReactNode {
  const { controllerString, patDeviceString } = props;

  const isPatDeviceConnected = useIsPatDeviceConnected();

  return isPatDeviceConnected ? patDeviceString : controllerString;
}
