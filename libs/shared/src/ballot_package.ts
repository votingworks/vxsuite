import {
  BallotLocale,
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
import { assert } from '@votingworks/basics';

export interface BallotPackage {
  electionDefinition: ElectionDefinition;
  ballots: BallotPackageEntry[];
}

export interface BallotPackageEntry {
  pdf: Buffer;
  ballotConfig: BallotConfig;
  layout: readonly BallotPageLayout[];
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
  layoutFilename: string;
  locales: BallotLocale;
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

function getFileByName(entries: JSZipObject[], name: string): JSZipObject {
  const result = entries.find((entry) => entry.name === name);

  if (!result) {
    throw new Error(`ballot package does not have a file called '${name}'`);
  }

  return result;
}

export async function readBallotPackageFromBuffer(
  source: Buffer
): Promise<BallotPackage> {
  const zipfile = await openZip(source);
  const entries = getEntries(zipfile);
  const electionEntry = getFileByName(entries, 'election.json');
  const manifestEntry = getFileByName(entries, 'manifest.json');

  const electionData = await readTextEntry(electionEntry);
  const manifest = (await readJsonEntry(
    manifestEntry
  )) as BallotPackageManifest;
  const ballots = await Promise.all(
    manifest.ballots.map<Promise<BallotPackageEntry>>(async (ballotConfig) => {
      const ballotEntry = getFileByName(entries, ballotConfig.filename);
      const layoutEntry = getFileByName(entries, ballotConfig.layoutFilename);

      const pdf = await readEntry(ballotEntry);
      const layout = safeParseJson(
        await readTextEntry(layoutEntry),
        z.array(BallotPageLayoutSchema)
      ).unsafeUnwrap();
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
  return readBallotPackageFromBuffer(await readFile(file));
}

export async function readBallotPackageFromFilePointer(
  file: KioskBrowser.FileSystemEntry
): Promise<BallotPackage> {
  assert(window.kiosk);
  return readBallotPackageFromBuffer(
    Buffer.from(await window.kiosk.readFile(file.path))
  );
}
