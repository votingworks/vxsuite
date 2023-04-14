import * as fs from 'fs';
import Database from 'better-sqlite3';
import { DateTime } from 'luxon';

const DUPLICATOR = 250;
const PATH_TO_WORKSPACE = 'dev-workspace';

function copyScannedImages(): void {
  const scannedImageFiles = fs.readdirSync(
    `${PATH_TO_WORKSPACE}/ballot-images/scanned-images`
  );
  console.log(scannedImageFiles.length);
  for (const scannedImage of scannedImageFiles) {
    for (let i = 0; i < DUPLICATOR; i += 1) {
      fs.copyFileSync(
        `${PATH_TO_WORKSPACE}/ballot-images/scanned-images/${scannedImage}`,
        `${PATH_TO_WORKSPACE}/ballot-images/scanned-images/${i}-${scannedImage}`
      );
    }
  }
}

function updateFileIndex(index: number, filePath: string): string {
  const pieces = filePath.split('/');
  pieces[pieces.length - 1] = `${index}-${pieces[pieces.length - 1]}`;
  return pieces.join('/');
}

function copyBallotImagesAndDatabaseRows(): void {
  const ballotsDb = new Database(`${PATH_TO_WORKSPACE}/ballots.db`);
  const allSheets = ballotsDb
    .prepare<[]>(
      `
      select
        id, batch_id,
        front_original_filename,
        front_normalized_filename,
        back_original_filename,
        back_normalized_filename, front_interpretation_json, back_interpretation_json
      from sheets
      `
    )
    .all();
  for (const sheetInfo of allSheets) {
    for (let i = 0; i < DUPLICATOR; i += 1) {
      fs.copyFileSync(
        sheetInfo.front_original_filename,
        updateFileIndex(i, sheetInfo.front_original_filename)
      );
      fs.copyFileSync(
        sheetInfo.front_normalized_filename,
        updateFileIndex(i, sheetInfo.front_normalized_filename)
      );
      fs.copyFileSync(
        sheetInfo.back_original_filename,
        updateFileIndex(i, sheetInfo.back_original_filename)
      );
      fs.copyFileSync(
        sheetInfo.back_normalized_filename,
        updateFileIndex(i, sheetInfo.back_normalized_filename)
      );
      const insert = ballotsDb.prepare(`insert into sheets (
id,
batch_id,
front_original_filename,
front_normalized_filename,
front_interpretation_json,
back_original_filename,
back_normalized_filename,
back_interpretation_json,
requires_adjudication,
finished_adjudication_at
      ) values (
?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )`);
      insert.run(
        `${i}-${sheetInfo.id}`,
        sheetInfo.batch_id,
        updateFileIndex(i, sheetInfo.front_original_filename),
        updateFileIndex(i, sheetInfo.front_normalized_filename),
        sheetInfo.front_interpretation_json,
        updateFileIndex(i, sheetInfo.back_original_filename),
        updateFileIndex(i, sheetInfo.back_normalized_filename),
        sheetInfo.back_interpretation_json,
        0,
        DateTime.now().toISOTime()
      );
    }
  }
}

export async function main(): Promise<number> {
  // copyScannedImages();
  copyBallotImagesAndDatabaseRows();
  return 0;
}
