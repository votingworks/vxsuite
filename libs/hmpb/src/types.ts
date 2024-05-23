export interface Dimensions<Unit extends number> {
  width: Unit;
  height: Unit;
}

export interface Point<Unit extends number> {
  x: Unit;
  y: Unit;
}

export interface Margins<Unit extends number> {
  top: Unit;
  right: Unit;
  bottom: Unit;
  left: Unit;
}

export type Measurements<Unit extends number> = Dimensions<Unit> & Point<Unit>;

export type Pixels = number;
export type PixelDimensions = Dimensions<Pixels>;
export type PixelMeasurements = Measurements<Pixels>;

export type Inches = number;
export type InchDimensions = Dimensions<Inches>;
export type InchMargins = Margins<Inches>;

export const BALLOT_MODES = ['official', 'test', 'sample'] as const;
export type BallotMode = (typeof BALLOT_MODES)[number];
