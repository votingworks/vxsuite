import { PageInterpretation, SheetOf } from '@votingworks/types';

export const BLANK_PAGE_MOCK: PageInterpretation = {
  type: 'BlankPage',
};

export const BLANK_PAGE_INTERPRETATION_MOCK: SheetOf<PageInterpretation> = [
  BLANK_PAGE_MOCK,
  BLANK_PAGE_MOCK,
];
