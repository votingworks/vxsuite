import type { Readable } from 'node:stream';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl as s3GetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { err, ok, type Result } from '@votingworks/basics';
import type { FileStorageClientError } from '@votingworks/election-definition-backend/election-package';

/**
 * A file storage client backed by S3, for deployed environments
 */
export class S3FileStorageClient {
  private readonly s3Client: S3Client;

  constructor() {
    this.s3Client = new S3Client({ region: process.env.AWS_S3_REGION });
  }

  // @coverage-defer
  async readFile(
    filePath: string
  ): Promise<Result<Readable, FileStorageClientError>> {
    const data = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: filePath,
      })
    );
    if (!data.Body) {
      return err({ type: 'undefined-body' });
    }
    return ok(data.Body as Readable);
  }

  // @coverage-defer
  async streamFile(filePath: string, contents: Readable): Promise<void> {
    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: filePath,
        Body: contents,
      },
    });

    await upload.done();
  }

  async getSignedUrl(
    filePath: string,
    expiresInSeconds: number = 3600
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: filePath,
    });
    // AWS SDK has internal @smithy/types version mismatches between client-s3
    // and s3-request-presigner that cause type errors at compile time despite
    // being compatible at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return s3GetSignedUrl(this.s3Client as any, command as any, {
      expiresIn: expiresInSeconds,
    });
  }
}
