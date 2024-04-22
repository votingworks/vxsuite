import { join } from 'path';

const BALLOT_ASSET_DIR = join(__dirname, 'ballot-assets');
export function getDiagnosticBallotFilepath(): string {
  return join(BALLOT_ASSET_DIR, 'sample-ballot-diagnostic.pdf');
}

export function getSampleBallotFilepath(): string {
  return join(
    __dirname,
    'ballot-assets',
    'bmd-ballot-general-north-springfield-style-5.jpg'
  );
}
