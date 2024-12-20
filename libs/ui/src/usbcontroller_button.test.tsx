import userEvent from '@testing-library/user-event';
import {
  cleanup,
  fireEvent,
  render,
  RenderOptions,
} from '../test/react_testing_library';
import { mockUsbDriveStatus } from './test-utils/mock_usb_drive';

import { UsbControllerButton } from './usbcontroller_button';

beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

test('shows No USB if usb absent', () => {
  const eject = jest.fn();
  const { container, getByText } = render(
    <UsbControllerButton
      usbDriveStatus={mockUsbDriveStatus('no_drive')}
      usbDriveEject={eject}
      usbDriveIsEjecting={false}
    />
  );

  expect(container.firstChild).toHaveTextContent('No USB');
  fireEvent.click(getByText('No USB'));
  expect(eject).not.toHaveBeenCalled();
});

test('renders as primary button variant', () => {
  const renderOptions: RenderOptions = {
    vxTheme: { colorMode: 'contrastLow', sizeMode: 'touchMedium' },
  };

  const nonPrimaryResult = render(
    <UsbControllerButton
      usbDriveStatus={mockUsbDriveStatus('mounted')}
      usbDriveEject={jest.fn()}
      usbDriveIsEjecting={false}
    />,
    renderOptions
  );
  const nonPrimaryButton = nonPrimaryResult.getButton('Eject USB');
  const nonPrimaryStyles = window.getComputedStyle(nonPrimaryButton);

  cleanup();

  const primaryResult = render(
    <UsbControllerButton
      usbDriveStatus={mockUsbDriveStatus('mounted')}
      usbDriveEject={jest.fn()}
      usbDriveIsEjecting={false}
      primary
    />,
    renderOptions
  );

  const primaryButton = primaryResult.getButton('Eject USB');
  expect(window.getComputedStyle(primaryButton)).not.toEqual(nonPrimaryStyles);
});

test('shows eject if mounted', () => {
  const eject = jest.fn();
  const { container, getByText } = render(
    <UsbControllerButton
      usbDriveStatus={mockUsbDriveStatus('mounted')}
      usbDriveEject={eject}
      usbDriveIsEjecting={false}
    />
  );

  expect(container.firstChild).toHaveTextContent('Eject USB');
  fireEvent.click(getByText('Eject USB'));
  expect(eject).toHaveBeenCalled();
});

test('shows ejected if recently ejected', () => {
  const eject = jest.fn();
  const { container, getByText } = render(
    <UsbControllerButton
      usbDriveStatus={mockUsbDriveStatus('ejected')}
      usbDriveEject={eject}
      usbDriveIsEjecting={false}
    />
  );

  expect(container.firstChild).toHaveTextContent('USB Ejected');
  fireEvent.click(getByText('USB Ejected'));
  expect(eject).not.toHaveBeenCalled();
});

test('shows ejecting if ejecting', () => {
  const eject = jest.fn();
  const { container, getByText } = render(
    <UsbControllerButton
      usbDriveStatus={mockUsbDriveStatus('mounted')}
      usbDriveEject={eject}
      usbDriveIsEjecting
    />
  );

  expect(container.firstChild).toHaveTextContent('Ejecting...');
  userEvent.click(getByText('Ejecting...'));
  expect(eject).not.toHaveBeenCalled();
});
