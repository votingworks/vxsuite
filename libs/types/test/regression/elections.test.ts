import fg from 'fast-glob';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { cwd } from 'node:process';
import { safeParseElection } from '../../src';

for (const electionJsonPath of fg.sync(
  join(__dirname, 'elections/**/election.json')
)) {
  const testName = relative(cwd(), electionJsonPath);
  test(testName, () => {
    safeParseElection(readFileSync(electionJsonPath, 'utf8')).unsafeUnwrap();
  });
}
