import { expect, test, vi } from 'vitest';
import { render } from '../../test/react_testing_library';
import { AssistiveTechInstructions } from './assistive_tech_instructions';
import { useIsPatDeviceConnected } from './pat_device_context';

vi.mock(import('./pat_device_context.js'));

const mockUseIsPatDeviceConnected = vi.mocked(useIsPatDeviceConnected);

test('renders controller string if PAT device is not connected', () => {
  mockUseIsPatDeviceConnected.mockReturnValue(false);

  const { container } = render(
    <AssistiveTechInstructions
      controllerString="Use the up and down buttons"
      patDeviceString="Use the move input"
    />
  );
  expect(container).toHaveTextContent('Use the up and down buttons');
});

test('renders PAT device string if PAT device is not connected', () => {
  mockUseIsPatDeviceConnected.mockReturnValue(true);

  const { container } = render(
    <AssistiveTechInstructions
      controllerString="Use the up and down buttons"
      patDeviceString="Use the move input"
    />
  );
  expect(container).toHaveTextContent('Use the move input');
});
