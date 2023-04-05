import {
  BallotMark,
  BallotPageLayoutWithImage,
  BallotPageMetadata,
  CompletedBallot,
  ImageData,
} from '@votingworks/types';
import { Buffer } from 'buffer';

export interface Interpreted {
  matchedTemplate: BallotPageLayoutWithImage;
  mappedBallot: ImageData;
  metadata: BallotPageMetadata;
  marks: BallotMark[];
  ballot: CompletedBallot;
}

export interface FindMarksResult {
  matchedTemplate: BallotPageLayoutWithImage;
  mappedBallot: ImageData;
  metadata: BallotPageMetadata;
  marks: BallotMark[];
}

export interface Input {
  id(): string;
  imageData(): Promise<ImageData>;
  metadataPath(): string;
  metadata?: () => Promise<BallotPageMetadata | undefined>;
}

export interface DetectQrCodeResult {
  data: Buffer;
  position: 'top' | 'bottom';
  detector: string;
}
