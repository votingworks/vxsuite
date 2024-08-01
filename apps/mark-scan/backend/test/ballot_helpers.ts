import { InterpretFileResult } from '@votingworks/ballot-interpreter';
import { SheetOf } from '@votingworks/types';
import { createImageData } from 'canvas';

export const MOCK_IMAGE = createImageData(1, 1);

export const BLANK_PAGE_MOCK: InterpretFileResult = {
  interpretation: { type: 'BlankPage' },
  normalizedImage: MOCK_IMAGE,
};

export const BLANK_PAGE_INTERPRETATION_MOCK: SheetOf<InterpretFileResult> = [
  BLANK_PAGE_MOCK,
  BLANK_PAGE_MOCK,
];
