import { Uint16toUint8, Uint32toUint8, Uint8 } from '../bits';

export type PaperMovementAfterScan =
  | 'hold_ticket'
  | 'move_forward'
  | 'move_back'
  | 'move_park';
export type ScanLight = 'red' | 'green' | 'blue' | 'white';
export type ScanDataFormat = 'BW' | 'grayscale';
export type Resolution = 100 | 150 | 200 | 250 | 300;
export type ScanDirection = 'forward' | 'backward' | 'in_park';

export interface ScannerConfig {
  scanLight: ScanLight;
  scanDataFormat: ScanDataFormat;
  horizontalResolution: Resolution;
  verticalResolution: Resolution;
  paperMovementAfterScan: PaperMovementAfterScan;
  scanDirection: ScanDirection;
  scanHorizontalDimensionInDots: number;
  scanMaxVerticalDimensionInDots: number;
  disableJamWheelSensor: boolean;
}

export const defaultConfig: ScannerConfig = {
  scanLight: 'white',
  scanDataFormat: 'grayscale',
  horizontalResolution: 200,
  verticalResolution: 200,
  paperMovementAfterScan: 'hold_ticket',
  scanDirection: 'forward',
  scanHorizontalDimensionInDots: 1728,
  scanMaxVerticalDimensionInDots: 0, // allows maximum
  disableJamWheelSensor: false,
};

type Encoder<T extends string | number> = Record<T, Uint8>;

const PaperMovementAfterScanEncoder: Encoder<PaperMovementAfterScan> = {
  hold_ticket: 0x00,
  move_forward: 0x01,
  move_back: 0x02,
  move_park: 0x03,
};

const ScanTypeEncoder: Record<ScanDataFormat, Encoder<ScanLight>> = {
  grayscale: {
    red: 0x01,
    green: 0x02,
    blue: 0x03,
    white: 0x05,
  },
  BW: {
    red: 0x08,
    green: 0x09,
    blue: 0x0a,
    white: 0x0c,
  },
};

const ScanDirectionEncoder: Encoder<ScanDirection> = {
  forward: 0x00,
  backward: 0x01,
  in_park: 0x03,
};

export function encodeScannerConfig(scannerConfig: ScannerConfig): Uint8[] {
  const data: Uint8[] = [];
  data.push(
    PaperMovementAfterScanEncoder[scannerConfig.paperMovementAfterScan]
  );
  data.push(scannerConfig.disableJamWheelSensor ? 0x04 : 0x00);
  data.push(ScanDirectionEncoder[scannerConfig.scanDirection]);
  data.push(0x00); // unsupported options
  data.push(
    ScanTypeEncoder[scannerConfig.scanDataFormat][scannerConfig.scanLight]
  );
  data.push(...Uint16toUint8(scannerConfig.horizontalResolution));
  data.push(...Uint16toUint8(scannerConfig.verticalResolution));
  data.push(...Uint16toUint8(scannerConfig.scanHorizontalDimensionInDots));
  data.push(...Uint32toUint8(scannerConfig.scanMaxVerticalDimensionInDots));
  console.log(data);
  return data;
}
