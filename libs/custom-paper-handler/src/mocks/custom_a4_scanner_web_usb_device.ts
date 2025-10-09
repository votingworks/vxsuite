import { mockWebUsbDevice, MockWebUsbDevice } from './web_usb_device';

const CUSTOM_A4_ENDPOINTS: USBEndpoint[] = [
  {
    endpointNumber: 4,
    direction: 'in',
    type: 'bulk',
    packetSize: 512,
  },
  {
    endpointNumber: 5,
    direction: 'out',
    type: 'bulk',
    packetSize: 512,
  },
  {
    endpointNumber: 3,
    direction: 'in',
    type: 'bulk',
    packetSize: 512,
  },
  {
    endpointNumber: 1,
    direction: 'in',
    type: 'bulk',
    packetSize: 512,
  },
  {
    endpointNumber: 2,
    direction: 'out',
    type: 'bulk',
    packetSize: 512,
  },
];

const CUSTOM_A4_INTERFACES: USBInterface[] = [
  {
    interfaceNumber: 0,
    alternate: {
      alternateSetting: 0,
      interfaceClass: 0xff,
      interfaceSubclass: 0xff,
      interfaceProtocol: 0xff,
      interfaceName: '',
      endpoints: CUSTOM_A4_ENDPOINTS,
    },
    alternates: [
      {
        alternateSetting: 0,
        interfaceClass: 0xff,
        interfaceSubclass: 0xff,
        interfaceProtocol: 0xff,
        interfaceName: '',
        endpoints: CUSTOM_A4_ENDPOINTS,
      },
    ],
    claimed: false,
  },
];

const CUSTOM_A4_CONFIGURATION: USBConfiguration = {
  configurationValue: 1,
  configurationName: 'Custom A4',
  interfaces: CUSTOM_A4_INTERFACES,
};

const CUSTOM_A4_CONFIGURATION_WITHOUT_ENDPOINTS: USBConfiguration = {
  ...CUSTOM_A4_CONFIGURATION,
  interfaces: [
    {
      ...(CUSTOM_A4_CONFIGURATION.interfaces[0] as USBInterface),
      alternate: {
        ...(CUSTOM_A4_CONFIGURATION.interfaces[0] as USBInterface).alternate,
        endpoints: [],
      },
      alternates: [
        {
          ...((CUSTOM_A4_CONFIGURATION.interfaces[0] as USBInterface)
            .alternates[0] as USBAlternateInterface),
          endpoints: [],
        },
      ],
    },
  ],
};

/**
 * Builds a mock WebUSBDevice of the Custom A4 scanner.
 */
export function mockCustomA4ScannerWebUsbDevice(): MockWebUsbDevice {
  const webUsbDevice = mockWebUsbDevice();
  webUsbDevice.mockSetConfiguration(CUSTOM_A4_CONFIGURATION);
  return webUsbDevice;
}

/**
 * Builds a mock WebUSBDevice of the Custom A4 scanner, but with all the
 * endpoints removed.
 */
export function mockCustomA4ScannerWebUsbDeviceWithoutEndpoints(): MockWebUsbDevice {
  const webUsbDevice = mockWebUsbDevice();
  webUsbDevice.mockSetConfiguration(CUSTOM_A4_CONFIGURATION_WITHOUT_ENDPOINTS);
  return webUsbDevice;
}
