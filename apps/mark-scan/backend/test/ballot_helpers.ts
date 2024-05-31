import { InterpretFileResult } from '@votingworks/ballot-interpreter';
import { SheetOf } from '@votingworks/types';

export const MOCK_IMAGE: ImageData = {
  colorSpace: 'srgb',
  data: new Uint8ClampedArray(),
  height: 0,
  width: 0,
} as const;

export const BLANK_PAGE_MOCK: InterpretFileResult = {
  interpretation: { type: 'BlankPage' },
  normalizedImage: MOCK_IMAGE,
};

export const BLANK_PAGE_INTERPRETATION_MOCK: SheetOf<InterpretFileResult> = [
  BLANK_PAGE_MOCK,
  BLANK_PAGE_MOCK,
];
