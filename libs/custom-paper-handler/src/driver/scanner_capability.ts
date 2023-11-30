import { integers } from '@votingworks/basics';
import {
  PaperMovementAfterScan,
  Resolution,
  ScanDataFormat,
  ScanLight,
} from './scanner_config';

type ScanLightCapabilityOption = ScanLight | 'UV';
type ScanDataFormatCapabilityOption = ScanDataFormat | 'RGB' | 'RGBU';
type ResolutionCapabilityOption = 50 | Resolution | 600;
type PaperSensor =
  | 'left'
  | 'right'
  | 'center'
  | 'desk_left'
  | 'desk_center'
  | 'desk_right'
  | 'out_left'
  | 'out_right'
  | 'out_center'
  | 'in_center_left'
  | 'in_center_right'
  | 'pre_cis'
  | 'post_cis';
type ScannerSensor = 'cover' | 'jam_wheel' | 'dualsheet' | 'print_paper';
type ScanSource = 'hardware_deskew' | 'CMC7' | 'cis_down' | 'cis_up' | 'void';

export interface ScannerCapability {
  paperMovementAfterScanOptions: PaperMovementAfterScan[];
  paperSensors: PaperSensor[];
  scannerSensors: ScannerSensor[];
  scanSources: ScanSource[];
  scanLightOptions: ScanLightCapabilityOption[];
  scanDataFormats: ScanDataFormatCapabilityOption[];
  horizontalResolutions: ResolutionCapabilityOption[];
  verticalResolutions: ResolutionCapabilityOption[];
  maxDotsHorizontal: number;
  maxDotsVertical: number;
  imageBufferSize: number;
  transactionBufferSize: number;
}

interface Decoder<Capability> {
  [code: number]: Capability;
}

const PaperMovementAfterScanDecoder: Decoder<PaperMovementAfterScan> = {
  0x01: 'hold_ticket',
  0x02: 'move_forward',
  0x03: 'move_back',
  0x04: 'move_park',
};
const PaperSensorDecoder: Decoder<PaperSensor> = {
  0x01: 'left',
  0x02: 'right',
  0x03: 'center',
  0x04: 'desk_left',
  0x05: 'desk_center',
  0x06: 'desk_right',
  0x07: 'out_left',
  0x08: 'out_right',
  0x09: 'out_center',
  0x0a: 'in_center_left',
  0x0b: 'in_center_right',
  0x0c: 'pre_cis',
  0x0d: 'post_cis',
};
const ScannerSensorDecoder: Decoder<ScannerSensor> = {
  0x01: 'cover',
  0x02: 'jam_wheel',
  0x03: 'dualsheet',
  0x04: 'print_paper',
};
const ScanSourcesDecoder: Decoder<ScanSource> = {
  0x01: 'hardware_deskew',
  0x02: 'CMC7',
  0x03: 'cis_down',
  0x04: 'cis_up',
  0x05: 'void',
};
const ScanLightsDecoder: Decoder<ScanLightCapabilityOption> = {
  0x01: 'red',
  0x02: 'green',
  0x03: 'blue',
  0x04: 'UV',
  0x05: 'white',
};
const ScanDataFormatDecoder: Decoder<ScanDataFormatCapabilityOption> = {
  0x01: 'BW',
  0x02: 'grayscale',
  0x03: 'RGB',
  0x04: 'RGBU',
};
const ResolutionDecoder: Decoder<ResolutionCapabilityOption> = {
  0x01: 50,
  0x02: 100,
  0x03: 150,
  0x04: 200,
  0x05: 250,
  0x06: 300,
  0x07: 600,
};

function decode<Capability>(
  code: number,
  decoder: Decoder<Capability>
): Capability {
  const option = decoder[code];
  if (!option) {
    throw new Error(`Unrecognized capability option code ${code} for `);
  }
  return option;
}

function getEmptyScannerCapability(): ScannerCapability {
  return {
    paperMovementAfterScanOptions: [],
    paperSensors: [],
    scannerSensors: [],
    scanSources: [],
    scanLightOptions: [],
    scanDataFormats: [],
    horizontalResolutions: [],
    verticalResolutions: [],
    maxDotsHorizontal: 0,
    maxDotsVertical: 0,
    imageBufferSize: 0,
    transactionBufferSize: 0,
  };
}

export function parseScannerCapability(data: DataView): ScannerCapability {
  const scannerCapability = getEmptyScannerCapability();
  let byteIndex = 4;

  // Parses capability block starting at the current byte
  function parseOptions<T>(decoder: Decoder<T>): T[] {
    const numOptions = data.getUint8(byteIndex + 1);
    return integers()
      .take(numOptions)
      .map((i) => decode(data.getUint8(byteIndex + 2 + i), decoder))
      .toArray();
  }

  while (byteIndex < data.byteLength) {
    const capabilityId = data.getUint8(byteIndex);
    switch (capabilityId) {
      case 0x80:
        scannerCapability.paperMovementAfterScanOptions = parseOptions(
          PaperMovementAfterScanDecoder
        );
        break;
      case 0x81:
        scannerCapability.paperSensors = parseOptions(PaperSensorDecoder);
        break;
      case 0x82:
        scannerCapability.scannerSensors = parseOptions(ScannerSensorDecoder);
        break;
      case 0x83:
        scannerCapability.scanSources = parseOptions(ScanSourcesDecoder);
        break;
      case 0x84:
        scannerCapability.scanLightOptions = parseOptions(ScanLightsDecoder);
        break;
      case 0x85:
        scannerCapability.scanDataFormats = parseOptions(ScanDataFormatDecoder);
        break;
      case 0x86:
        scannerCapability.horizontalResolutions =
          parseOptions(ResolutionDecoder);
        break;
      case 0x87:
        scannerCapability.verticalResolutions = parseOptions(ResolutionDecoder);
        break;
      case 0x88:
        scannerCapability.maxDotsHorizontal = data.getUint32(byteIndex + 3);
        scannerCapability.maxDotsVertical = data.getUint32(byteIndex + 8);
        break;
      case 0x89:
        scannerCapability.imageBufferSize = data.getUint32(byteIndex + 3);
        scannerCapability.transactionBufferSize = data.getUint32(byteIndex + 8);
        break;
      default:
        throw new Error('unknown capability ID');
    }
    const dataByteLength = data.getUint8(byteIndex + 1);
    byteIndex += 2 + dataByteLength;
  }
  return scannerCapability;
}
