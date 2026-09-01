import type { SourceFile } from '@typescript/native/unstable/ast';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { onTestFinished, vi } from 'vitest';
import type { IstanbulFileCoverageData } from '../src/istanbul.js';
import {
  startTypescriptCompilerSession,
  type TypescriptCompilerSession,
} from '../src/typescript.js';

/**
 * The fixture project: `fixtures/src` holds small sources covering the
 * repo's real patterns; `test/global_setup.ts` generates their istanbul report
 * into `fixtures/coverage/coverage-final.json` before the suite runs.
 */
export const FIXTURES_DIR = resolve(__dirname, '../fixtures');

/**
 * The generated fixture report.
 */
export function fixtureReport(): IstanbulFileCoverageData[] {
  return Object.values(
    JSON.parse(
      readFileSync(join(FIXTURES_DIR, 'coverage/coverage-final.json'), 'utf8')
    ) as Record<string, IstanbulFileCoverageData>
  );
}

/**
 * Captures everything written to stdout until mocks are restored.
 */
export function captureStdout(): { text: () => string } {
  const chunks: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  return { text: () => chunks.join('') };
}

/**
 * A throwaway package directory with a tsconfig and the given files.
 */
export function makeTempPackage(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), 'coverage-check-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(
    join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        jsx: 'react',
        jsxFactory: 'h',
        types: [],
        lib: ['es2022'],
      },
      include: ['src'],
    })
  );
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(directory, name)), { recursive: true });
    writeFileSync(join(directory, name), text);
  }
  return directory;
}

/**
 * Opens a session on a temp package; closed when the test finishes.
 */
export function openTempPackage(files: Record<string, string>): {
  directory: string;
  session: TypescriptCompilerSession;
} {
  const directory = makeTempPackage(files);
  const session = startTypescriptCompilerSession(directory);
  onTestFinished(() => session.close());
  return { directory, session };
}

/**
 * Parses one source file through a temp package.
 */
export function parseSnippet(text: string, name = 'src/a.ts'): SourceFile {
  const { directory, session } = openTempPackage({ [name]: text });
  return session.sourceFile(join(directory, name));
}
