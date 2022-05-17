/// <reference types="kiosk-browser" />

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
import { Buffer } from 'buffer';
import 'fast-text-encoding';
import JsZip, { JSZipObject } from 'jszip';
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

async function openZip(data: Uint8Array): Promise<JsZip> {
  return await new JsZip().loadAsync(data);
}

function getEntries(zipfile: JsZip): JSZipObject[] {
  return Object.values(zipfile.files);
}

async function readEntry(entry: JSZipObject): Promise<Buffer> {
  return entry.async('nodebuffer');
}

async function readTextEntry(entry: JSZipObject): Promise<string> {
  const bytes = await readEntry(entry);
  return new TextDecoder().decode(bytes);
}

async function readJsonEntry(entry: JSZipObject): Promise<unknown> {
  return JSON.parse(await readTextEntry(entry));
}

export async function readBallotPackageFromBuffer(
  source: Buffer,
  fileName: string,
  fileSize: number
): Promise<BallotPackage> {
  const zipfile = await openZip(source);
  const entries = getEntries(zipfile);
  const electionEntry = entries.find((entry) => entry.name === 'election.json');
  const manifestEntry = entries.find((entry) => entry.name === 'manifest.json');

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

  const electionData = await readTextEntry(electionEntry);
  const manifest = (await readJsonEntry(
    manifestEntry
  )) as BallotPackageManifest;
  const ballots = await Promise.all(
    manifest.ballots.map<Promise<BallotPackageEntry>>(async (ballotConfig) => {
      const ballotEntry = entries.find(
        (entry) => entry.name === ballotConfig.filename
      );

      if (!ballotEntry) {
        throw new Error(
          `ballot package does not have a file called '${ballotConfig.filename}': ${fileName} (size=${fileSize})`
        );
      }

      const layoutEntry = entries.find(
        (entry) => entry.name === ballotConfig.layoutFilename
      );

      const pdf = await readEntry(ballotEntry);
      const layout = layoutEntry
        ? safeParseJson(
            await readTextEntry(layoutEntry),
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
