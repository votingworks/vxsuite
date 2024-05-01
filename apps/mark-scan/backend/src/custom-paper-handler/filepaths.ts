import { join } from 'path';

export function getSampleBallotFilepath(): string {
  return join(
    __dirname,
    'fixtures',
    'bmd-ballot-general-north-springfield-style-5.jpg'
  );
}
