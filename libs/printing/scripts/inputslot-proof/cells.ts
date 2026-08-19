/* istanbul ignore file */
/**
 * The option matrix, mirroring how VxMark actually submits print jobs.
 *
 * `baselineSetsFlag` records whether the corresponding real call site passed
 * `isM404nSupportRequired: true` before this change. The one-sided cells stand
 * in for the summary-ballot and test-page call sites, which did; the two-sided
 * cells stand in for the HMPB ballot prints in print_ballot.tsx, which did not.
 */
import {
  PrintSides,
  type PaperSize,
  type PrintOptions,
} from '../../src/printer/types';

export interface Cell {
  name: string;
  options: PrintOptions;
  baselineSetsFlag: boolean;
}

const SIZES: PaperSize[] = [
  'letter',
  'legal',
  'custom-8.5x17',
  'custom-8.5x18',
  'custom-8.5x19',
  'custom-8.5x20',
  'custom-8.5x22',
];

export const CELLS: Cell[] = [
  // Summary ballot / test page: one-sided, flag set before this change.
  {
    name: 'one-sided/default',
    options: { sides: PrintSides.OneSided },
    baselineSetsFlag: true,
  },
  ...SIZES.map((size) => ({
    name: `one-sided/${size}`,
    options: { sides: PrintSides.OneSided, size },
    baselineSetsFlag: true,
  })),
  {
    name: 'one-sided/copies=3',
    options: { sides: PrintSides.OneSided, copies: 3 },
    baselineSetsFlag: true,
  },
  {
    name: 'one-sided/raw-fit-to-page',
    options: { sides: PrintSides.OneSided, raw: { 'fit-to-page': 'true' } },
    baselineSetsFlag: true,
  },
  {
    name: 'one-sided/raw-InputSlot-override',
    options: { sides: PrintSides.OneSided, raw: { InputSlot: 'Upper' } },
    baselineSetsFlag: true,
  },

  // HMPB ballots: two-sided, flag NOT set before this change.
  ...SIZES.map((size) => ({
    name: `two-sided-long-edge/${size}`,
    options: { sides: PrintSides.TwoSidedLongEdge, size },
    baselineSetsFlag: false,
  })),
  ...SIZES.map((size) => ({
    name: `two-sided-short-edge/${size}`,
    options: { sides: PrintSides.TwoSidedShortEdge, size },
    baselineSetsFlag: false,
  })),
];
