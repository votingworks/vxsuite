import { expect, test } from 'vitest';
import * as fc from 'fast-check';
import { convertToInternalScanParameters } from './parameters';
import { arbitraryScanParameters } from '../test/arbitraries';
import {
  DoubleSheetDetectOpt,
  FormStanding,
  ImageColorDepthType,
  ImageResolution,
  ScanSide,
} from './types';

test('convertToInternalScanParameters', () => {
  fc.assert(
    fc.property(
      arbitraryScanParameters().filter(
        (scanParameters) =>
          // 600 DPI is not supported
          scanParameters.resolution !== ImageResolution.RESOLUTION_600_DPI
      ),
      (scanParameters) => {
        convertToInternalScanParameters(scanParameters);
      }
    )
  );
});

test('convertToInternalScanParameters with 600 DPI', () => {
  expect(() =>
    convertToInternalScanParameters({
      wantedScanSide: ScanSide.A,
      resolution: ImageResolution.RESOLUTION_600_DPI,
      imageColorDepth: ImageColorDepthType.Grey8bpp,
      formStandingAfterScan: FormStanding.HOLD_TICKET,
      doubleSheetDetection: DoubleSheetDetectOpt.DetectOff,
    })
  ).toThrowError('Unsupported resolution: 600');
});
