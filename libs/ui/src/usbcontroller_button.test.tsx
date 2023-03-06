import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  RenderOptions,
} from '../test/react_testing_library';

import { UsbControllerButton } from './usbcontroller_button';

beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
  delete window.kiosk;
});

test('shows No USB if usb absent', () => {
  const eject = jest.fn();
  const { container, getByText } = render(
    <UsbControllerButton usbDriveStatus="absent" usbDriveEject={eject} />
  );

  expect(container.firstChild).toHaveTextContent('No USB');
  fireEvent.click(getByText('No USB'));
  expect(eject).not.toHaveBeenCalled();
});

test('renders as primary button variant', () => {
  const renderOptions: RenderOptions = {
    vxTheme: { colorMode: 'contrastLow', sizeMode: 'm' },
  };

  const nonPrimaryResult = render(
    <UsbControllerButton usbDriveStatus="mounted" usbDriveEject={jest.fn()} />,
    renderOptions
  );
  const nonPrimaryButton = nonPrimaryResult.getButton('Eject USB');
  const nonPrimaryStyles = window.getComputedStyle(nonPrimaryButton);

  cleanup();

  const primaryResult = render(
    <UsbControllerButton
      usbDriveStatus="mounted"
      usbDriveEject={jest.fn()}
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
    <UsbControllerButton usbDriveStatus="mounted" usbDriveEject={eject} />
  );

  expect(container.firstChild).toHaveTextContent('Eject USB');
  fireEvent.click(getByText('Eject USB'));
  expect(eject).toHaveBeenCalled();
});

test('shows ejected if recently ejected', () => {
  const eject = jest.fn();
  const { container, getByText } = render(
    <UsbControllerButton usbDriveStatus="ejected" usbDriveEject={eject} />
  );

  expect(container.firstChild).toHaveTextContent('Ejected');
  fireEvent.click(getByText('Ejected'));
  expect(eject).not.toHaveBeenCalled();
});

test('shows connecting while mounting', () => {
  const eject = jest.fn();
  const { container, getByText } = render(
    <UsbControllerButton usbDriveStatus="mounting" usbDriveEject={eject} />
  );

  expect(container.firstChild).toHaveTextContent('Connecting…');
  fireEvent.click(getByText('Connecting…'));
  expect(eject).not.toHaveBeenCalled();
});

test('shows ejecting while ejecting', () => {
  const eject = jest.fn();
  const { container, getByText } = render(
    <UsbControllerButton usbDriveStatus="ejecting" usbDriveEject={eject} />
  );

  expect(container.firstChild).toHaveTextContent('Ejecting…');
  fireEvent.click(getByText('Ejecting…'));
  expect(eject).not.toHaveBeenCalled();
});
