import {
  BallotPageMetadata,
  BallotPageMetadataSchema,
  safeParseJSON,
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

  async metadata(
    overrides: Partial<BallotPageMetadata> = {}
  ): Promise<BallotPageMetadata> {
    return {
      ...safeParseJSON(
        await fs.readFile(adjacentMetadataFile(this.filePath()), 'utf8'),
        BallotPageMetadataSchema
      ).unsafeUnwrap(),
      ...overrides,
    };
  }
}

export const croppedQRCode = new Fixture(
  join(__dirname, 'fixtures/croppedQRCode.jpg')
);
