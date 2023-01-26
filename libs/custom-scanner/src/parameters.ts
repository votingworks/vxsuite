import { ScanParametersInternal } from './protocol';
import {
  ImageResolution,
  ScanParameters,
  UltrasonicSensorLevelInternal,
} from './types';

type ResolutionProps = Pick<
  ScanParametersInternal,
  | 'resolutionX'
  | 'resolutionY'
  | 'offsetX'
  | 'offsetY'
  | 'imageWidth'
  | 'imageHeight'
>;

const resolutionPropsMap: Record<number, ResolutionProps> = {
  [ImageResolution.RESOLUTION_200_DPI]: {
    resolutionX: ImageResolution.RESOLUTION_200_DPI,
    resolutionY: ImageResolution.RESOLUTION_200_DPI,
    offsetX: 8,
    offsetY: 0,
    imageWidth: 1712,
    imageHeight: 9980,
  },
  [ImageResolution.RESOLUTION_300_DPI]: {
    resolutionX: ImageResolution.RESOLUTION_300_DPI,
    resolutionY: ImageResolution.RESOLUTION_300_DPI,
    offsetX: 12,
    offsetY: 0,
    imageWidth: 2568,
    imageHeight: 14970,
  },
};

/**
 * Converts the high-level scan parameters to the low-level internal scan parameters.
 */
export function convertToInternalScanParameters(
  scanParameters: ScanParameters
): ScanParametersInternal {
  const resolutionProps = resolutionPropsMap[scanParameters.resolution];

  if (!resolutionProps) {
    throw new Error(`Unsupported resolution: ${scanParameters.resolution}`);
  }

  return {
    acquireBackScan: false,
    acquireNoShading: false,
    acquireNoMirror: false,
    acquirePageRead: false,
    acquireAuthThreshold: false,
    acquireDetectColor: false,
    acquireAutoLevel: false,
    acquireAutoColor: false,
    acquireLeftAlign: false,
    acquirePageFill: false,
    acquireCropDeskew: false,
    acquirePseudoSensor: true,
    acquireTestPattern: false,
    acquireLampOff: false,
    acquireNoPaperSensor: true,
    acquireMotorOff: false,
    ultrasonicSensorLevel: UltrasonicSensorLevelInternal.Level1,
    disableUltrasonicSensor: false,
    disableHardwareDeskew: true,
    formStandingAfterScan: scanParameters.formStandingAfterScan,
    wantedScanSide: scanParameters.wantedScanSide,
    bitType: scanParameters.imageColorDepth & 0x0f,
    colorMode: (scanParameters.imageColorDepth >> 8) & 0x0f,
    ...resolutionProps,
  };
}
