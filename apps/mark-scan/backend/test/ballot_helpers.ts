import { InterpretFileResult } from '@votingworks/ballot-interpreter';
import { BLANK_PAGE_IMAGE_DATA } from '@votingworks/image-utils';
import { SheetOf } from '@votingworks/types';

export const BLANK_PAGE_MOCK: InterpretFileResult = {
  interpretation: { type: 'BlankPage' },
  normalizedImage: BLANK_PAGE_IMAGE_DATA,
};

export const BLANK_PAGE_INTERPRETATION_MOCK: SheetOf<InterpretFileResult> = [
  BLANK_PAGE_MOCK,
  BLANK_PAGE_MOCK,
];
