import {
  BallotPageMetadata,
  BallotPageMetadataSchema,
  safeParseJson,
} from '@votingworks/types';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Input } from '../src';
import { vh as flipVH } from '../src/utils/flip';
import { loadImageData } from '../src/utils/images';
import { adjacentFile } from '../src/utils/path';

export function adjacentMetadataFile(imagePath: string): string {
  return adjacentFile('-metadata', imagePath, '.json');
}

export class Fixture implements Input {
  constructor(private readonly basePath: string) {}

  id(): string {
    return this.filePath();
  }

  filePath(): string {
    return this.basePath;
  }

  async imageData({ flipped = false } = {}): Promise<ImageData> {
    const imageData = await loadImageData(this.filePath());
    if (flipped) {
      flipVH(imageData);
    }
    return imageData;
  }

  metadataPath(): string {
    return adjacentMetadataFile(this.filePath());
  }

  async metadata(
    overrides: Partial<BallotPageMetadata> = {}
  ): Promise<BallotPageMetadata> {
    return {
      ...safeParseJson(
        await fs.readFile(this.metadataPath(), 'utf-8'),
        BallotPageMetadataSchema
      ).unsafeUnwrap(),
      ...overrides,
    };
  }
}

/**
 * A QR code that is not readable due to it being cropped.
 */
export const croppedQrCode = new Fixture(
  join(__dirname, 'fixtures/cropped-qr-code.jpg')
);

/**
 * A long contest that is quite skewed.
 */
export const skewedLongContest = new Fixture(
  join(__dirname, 'fixtures/skewed-long-contest.png')
);

/**
 * A contest box whose top-right corner was not found correctly.
 */
export const topRightCornerRegressionTest = new Fixture(
  join(__dirname, 'fixtures/top-right-corner-regression-test.png')
);

/**
 * A contest box whose top-left corner was not found correctly.
 */
export const topLeftCornerRegressionTest = new Fixture(
  join(__dirname, 'fixtures/top-left-corner-regression-test.png')
);
