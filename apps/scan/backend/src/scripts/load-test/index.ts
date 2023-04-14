import * as fs from 'fs';

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

function copyBallotImagesAndDatabaseRows(): void {
  const ballotDb = fs.readdirSync(`${PATH_TO_WORKSPACE}/ballots.db`);
  console.log(scannedImageFiles.length);
  for (const scannedImage of scannedImageFiles) {
    for (let i = 0; i < DUPLICATOR; i += 1) {
      /* fs.copyFileSync(
	      `${PATH_TO_WORKSPACE}/ballot-images/scanned-images/${scannedImage}`,
	      `${PATH_TO_WORKSPACE}/ballot-images/scanned-images/${i}-${scannedImage}`
	    ); */
    }
  }
}

export async function main(): Promise<number> {
  // copyScannedImages();
  copyBallotImagesAndDatabaseRows();
  return 0;
}
