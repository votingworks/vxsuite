// Data models matching the TUI's Rust structs

export interface PixelBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CvrOption {
  readonly name: string;
  readonly isWriteIn: boolean;
  readonly bounds?: PixelBounds;
  readonly score: number;
  readonly hasIndication: boolean;
}

export interface CvrContest {
  readonly id: string;
  readonly page: number;
  readonly options: CvrOption[];
}

export interface FullCvrData {
  readonly ballotStyle: string;
  readonly contests: CvrContest[];
}

export interface BallotEntry {
  readonly id: string;
  readonly ballotStyle?: string;
  readonly maxScore: number;
  readonly isRejected: boolean;
  readonly path: string;
}

export interface Machine {
  readonly id: string;
  readonly path: string;
}

export type ImageSide = 'front' | 'back';

export interface Filter {
  readonly ballotStyle: string;
  readonly wiScoreMin: number;
  readonly wiScoreMax: number;
  readonly showRejected: boolean;
  readonly writeInFilterEnabled: boolean;
}

export const DEFAULT_FILTER: Filter = {
  ballotStyle: '',
  wiScoreMin: 0,
  wiScoreMax: 1,
  showRejected: true,
  writeInFilterEnabled: false,
};

export function passesFilter(entry: BallotEntry, filter: Filter): boolean {
  if (entry.isRejected && !filter.showRejected) {
    return false;
  }
  if (filter.ballotStyle) {
    const style = entry.ballotStyle ?? '';
    if (!style.includes(filter.ballotStyle)) {
      return false;
    }
  }
  if (filter.writeInFilterEnabled) {
    if (entry.maxScore < filter.wiScoreMin || entry.maxScore > filter.wiScoreMax) {
      return false;
    }
  }
  return true;
}
