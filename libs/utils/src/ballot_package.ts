import {
  BallotLocales,
  BallotPageLayout,
  BallotPageLayoutSchema,
  BallotStyleId,
  ContestId,
  ElectionDefinition,
  PrecinctId,
  safeParseElectionDefinition,
  safeParseJson,
} from '@votingworks/types';
import 'fast-text-encoding';
import { Entry, fromBuffer, ZipFile } from 'yauzl';
import { z } from 'zod';
import { assert } from './assert';

export interface BallotPackage {
  electionDefinition: ElectionDefinition;
  ballots: BallotPackageEntry[];
}

export interface BallotPackageEntry {
  pdf: Buffer;
  ballotConfig: BallotConfig;
  // TODO: Make this required.
  // For now we have fixtures that don't have this, but we should fix that.
  // https://github.com/votingworks/vxsuite/issues/1595
  layout?: BallotPageLayout[];
}

export interface BallotPackageManifest {
  ballots: readonly BallotConfig[];
}

export interface BallotStyleData {
  ballotStyleId: BallotStyleId;
  contestIds: ContestId[];
  precinctId: PrecinctId;
}

export interface BallotConfig extends BallotStyleData {
  filename: string;
  // TODO: Make this required.
  // For now we have fixtures that don't have this, but we should fix that.
  // https://github.com/votingworks/vxsuite/issues/1595
  layoutFilename?: string;
  locales: BallotLocales;
  isLiveMode: boolean;
  isAbsentee: boolean;
}

function readFile(file: File): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    /* istanbul ignore next */
    reader.onerror = () => {
      reject(reader.error);
    };

    reader.onload = () => {
      resolve(Buffer.from(reader.result as ArrayBuffer));
    };

    reader.readAsArrayBuffer(file);
  });
}

function openZip(data: Uint8Array): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    fromBuffer(
      Buffer.from(data),
      { lazyEntries: true, validateEntrySizes: true },
      (error, zipfile) => {
        if (error || !zipfile) {
          reject(error);
        } else {
          resolve(zipfile);
        }
      }
    );
  });
}

function getEntries(zipfile: ZipFile): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: Entry[] = [];

    zipfile
      .on('entry', (entry: Entry) => {
        entries.push(entry);
        zipfile.readEntry();
      })
      .on('end', () => {
        resolve(entries);
      })
      .on(
        'error',
        /* istanbul ignore next */
        (error) => {
          reject(error);
        }
      )
      .readEntry();
  });
}

async function readEntry(zipfile: ZipFile, entry: Entry): Promise<Buffer> {
  const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    zipfile.openReadStream(entry, (error, value) => {
      /* istanbul ignore else */
      if (!error && value) {
        resolve(value);
      } else {
        reject(error);
      }
    });
  });

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream
      .on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      })
      .on('end', () => {
        resolve(Buffer.concat(chunks));
      })
      .on(
        'error',
        /* istanbul ignore next */
        (error) => {
          reject(error);
        }
      );
  });
}

async function readTextEntry(zipfile: ZipFile, entry: Entry): Promise<string> {
  const bytes = await readEntry(zipfile, entry);
  return new TextDecoder().decode(bytes);
}

async function readJsonEntry(zipfile: ZipFile, entry: Entry): Promise<unknown> {
  return JSON.parse(await readTextEntry(zipfile, entry));
}

export async function readBallotPackageFromBuffer(
  source: Buffer,
  fileName: string,
  fileSize: number
): Promise<BallotPackage> {
  const zipfile = await openZip(source);
  const entries = await getEntries(zipfile);
  const electionEntry = entries.find(
    (entry) => entry.fileName === 'election.json'
  );
  const manifestEntry = entries.find(
    (entry) => entry.fileName === 'manifest.json'
  );

  if (!electionEntry) {
    throw new Error(
      `ballot package does not have a file called 'election.json': ${fileName} (size=${fileSize})`
    );
  }

  if (!manifestEntry) {
    throw new Error(
      `ballot package does not have a file called 'manifest.json': ${fileName} (size=${fileSize})`
    );
  }

  const electionData = await readTextEntry(zipfile, electionEntry);
  const manifest = (await readJsonEntry(
    zipfile,
    manifestEntry
  )) as BallotPackageManifest;
  const ballots = await Promise.all(
    manifest.ballots.map<Promise<BallotPackageEntry>>(async (ballotConfig) => {
      const ballotEntry = entries.find(
        (entry) => entry.fileName === ballotConfig.filename
      );

      if (!ballotEntry) {
        throw new Error(
          `ballot package does not have a file called '${ballotConfig.filename}': ${fileName} (size=${fileSize})`
        );
      }

      const layoutEntry = entries.find(
        (entry) => entry.fileName === ballotConfig.layoutFilename
      );

      const pdf = await readEntry(zipfile, ballotEntry);
      const layout = layoutEntry
        ? safeParseJson(
            await readTextEntry(zipfile, layoutEntry),
            z.array(BallotPageLayoutSchema)
          ).unsafeUnwrap()
        : undefined;
      return {
        pdf,
        layout,
        ballotConfig,
      };
    })
  );

  return {
    electionDefinition:
      safeParseElectionDefinition(electionData).unsafeUnwrap(),
    ballots,
  };
}

export async function readBallotPackageFromFile(
  file: File
): Promise<BallotPackage> {
  return readBallotPackageFromBuffer(
    await readFile(file),
    file.name,
    file.size
  );
}

export async function readBallotPackageFromFilePointer(
  file: KioskBrowser.FileSystemEntry
): Promise<BallotPackage> {
  assert(window.kiosk);
  return readBallotPackageFromBuffer(
    Buffer.from(await window.kiosk.readFile(file.path)),
    file.name,
    file.size
  );
}
