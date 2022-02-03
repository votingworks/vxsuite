import {
  BallotImage,
  BallotMark,
  BallotPageLayout,
  BallotPageMetadata,
  CompletedBallot,
  ImageData,
} from '@votingworks/types';

export interface GetBallotOptions {
  markScoreVoteThreshold: number;
}

export interface Interpreted {
  matchedTemplate: BallotPageLayout;
  mappedBallot: ImageData;
  metadata: BallotPageMetadata;
  marks: BallotMark[];
  ballot: CompletedBallot;
}

export interface FindMarksResult {
  matchedTemplate: BallotPageLayout;
  mappedBallot: ImageData;
  metadata: BallotPageMetadata;
  marks: BallotMark[];
}

export interface UninterpretedBallot {
  ballotImage: BallotImage;
  reason: string | Error;
}

export interface Input {
  id(): string;
  imageData(): Promise<ImageData>;
  metadata?: () => Promise<BallotPageMetadata | undefined>;
}

export interface DetectQrCodeResult {
  data: Buffer;
  rightSideUp?: boolean;
}

export interface DetectQrCode {
  (imageData: ImageData): Promise<DetectQrCodeResult | undefined>;
}
