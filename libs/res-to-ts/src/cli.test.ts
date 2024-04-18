import { mockReadable, mockWritable } from '@votingworks/test-utils';
import { dirSync, fileSync } from 'tmp';
import { promises as fs } from 'fs';
import { join } from 'path';
import { main } from '.';
import { absolutize, getOutputPath, relativize, Stdio } from './cli';

test('absolutize', () => {
  expect(absolutize('/foo/bar', '/baz')).toEqual('/foo/bar');
  expect(absolutize('foo/bar', '/baz')).toEqual('/baz/foo/bar');
});

test('relativize', () => {
  expect(relativize('/foo/bar', '/foo')).toEqual('bar');
  expect(relativize('/foo/bar', '/baz')).toEqual('../foo/bar');
  expect(relativize('/foo/bar')).toEqual('/foo/bar');
});

test('-h', async () => {
  const stdio: Stdio = {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr: mockWritable(),
  };

  const exitCode = await main(['node', '/path/to/res-to-ts', '-h'], stdio);
  expect({
    exitCode,
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toMatchInlineSnapshot(`
    {
      "exitCode": 0,
      "stderr": "",
      "stdout": "usage: res-to-ts [--help] [--check] FILE [… FILE]

    Converts resources to be usable as TypeScript files.
    ",
    }
  `);
});

test('--help', async () => {
  const stdio: Stdio = {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr: mockWritable(),
  };

  const exitCode = await main(['node', '/path/to/res-to-ts', '--help'], stdio);
  expect({
    exitCode,
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toMatchInlineSnapshot(`
    {
      "exitCode": 0,
      "stderr": "",
      "stdout": "usage: res-to-ts [--help] [--check] FILE [… FILE]

    Converts resources to be usable as TypeScript files.
    ",
    }
  `);
});

test('invalid option', async () => {
  const stdio: Stdio = {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr: mockWritable(),
  };

  const exitCode = await main(
    ['node', '/path/to/res-to-ts', '--invalid'],
    stdio
  );
  expect({
    exitCode,
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toMatchInlineSnapshot(`
    {
      "exitCode": 1,
      "stderr": "error: unrecognized option: --invalid
    usage: res-to-ts [--help] [--check] FILE [… FILE]

    Converts resources to be usable as TypeScript files.
    ",
      "stdout": "",
    }
  `);
});

test('missing rootDir', async () => {
  const stdio: Stdio = {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr: mockWritable(),
  };

  const exitCode = await main(
    ['node', '/path/to/res-to-ts', '--rootDir'],
    stdio
  );
  expect({
    exitCode,
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toMatchInlineSnapshot(`
    {
      "exitCode": 1,
      "stderr": "error: missing root directory after '--rootDir'
    usage: res-to-ts [--help] [--check] FILE [… FILE]

    Converts resources to be usable as TypeScript files.
    ",
      "stdout": "",
    }
  `);
});

test('missing outDir', async () => {
  const stdio: Stdio = {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr: mockWritable(),
  };

  const exitCode = await main(
    ['node', '/path/to/res-to-ts', '--outDir'],
    stdio
  );
  expect({
    exitCode,
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toMatchInlineSnapshot(`
    {
      "exitCode": 1,
      "stderr": "error: missing output directory after '--outDir'
    usage: res-to-ts [--help] [--check] FILE [… FILE]

    Converts resources to be usable as TypeScript files.
    ",
      "stdout": "",
    }
  `);
});

test('no files given', async () => {
  const stdio: Stdio = {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr: mockWritable(),
  };

  const exitCode = await main(['node', '/path/to/res-to-ts'], stdio);
  expect({
    exitCode,
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toEqual({
    exitCode: 1,
    stdout: '',
    stderr: expect.stringContaining('error: no resources given'),
  });
});

test('convert image adjacent', async () => {
  const path = fileSync({ template: 'XXXXXX.png' }).name;
  await fs.writeFile(path, 'content');

  const stdio: Stdio = {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr: mockWritable(),
  };

  const tsPath = getOutputPath(path);
  const exitCode = await main(['node', '/path/to/res-to-ts', path], stdio);
  expect({
    exitCode,
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toEqual({
    exitCode: 0,
    stdout: `📝 ${relativize(tsPath, process.cwd())}\n`,
    stderr: '',
  });

  const content = await fs.readFile(tsPath, 'utf8');
  expect(content).toContain(`const resourceDataBase64 = 'Y29udGVudA=='`);
  expect(content).toContain(`const mimeType = 'image/png'`);
  expect(content).toContain(`export async function asImage()`);
});

test('convert w/outDir', async () => {
  const root = dirSync().name;
  const rootDir = join(root, 'input');
  const outDir = join(root, 'output');
  const path = join(rootDir, 'image.png');
  await fs.mkdir(rootDir, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path, 'content');

  const stdio: Stdio = {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr: mockWritable(),
  };

  const tsPath = getOutputPath(path, rootDir, outDir);
  const exitCode = await main(
    [
      'node',
      '/path/to/res-to-ts',
      path,
      '--rootDir',
      rootDir,
      '--outDir',
      outDir,
    ],
    stdio
  );
  expect({
    exitCode,
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toEqual({
    exitCode: 0,
    stdout: `📝 ${relativize(tsPath, process.cwd())}\n`,
    stderr: '',
  });

  const content = await fs.readFile(tsPath, 'utf8');
  expect(content).toContain(`const resourceDataBase64 = 'Y29udGVudA=='`);
  expect(content).toContain(`const mimeType = 'image/png'`);
  expect(content).toContain(`export async function asImage()`);
});

test('convert w/implicit rootDir', async () => {
  const root = dirSync().name;
  const rootDir = join(root, 'input');
  const outDir = join(root, 'output');
  const path = join(rootDir, 'image.png');
  await fs.mkdir(rootDir, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path, 'content');

  const stdio: Stdio = {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr: mockWritable(),
  };

  const oldPwd = process.cwd();
  try {
    process.chdir(rootDir);
    const tsPath = getOutputPath(path, rootDir, outDir);
    const exitCode = await main(
      ['node', '/path/to/res-to-ts', path, '--outDir', outDir],
      stdio
    );
    expect({
      exitCode,
      stdout: stdio.stdout.toString(),
      stderr: stdio.stderr.toString(),
    }).toEqual({
      exitCode: 0,
      stdout: `📝 ${relativize(tsPath, rootDir)}\n`,
      stderr: '',
    });

    const content = await fs.readFile(tsPath, 'utf8');
    expect(content).toContain(`const resourceDataBase64 = 'Y29udGVudA=='`);
    expect(content).toContain(`const mimeType = 'image/png'`);
    expect(content).toContain(`export async function asImage()`);
  } finally {
    process.chdir(oldPwd);
  }
});

test('convert failure: resource not in rootDir', async () => {
  const path = fileSync({ template: 'XXXXXX.png' }).name;
  await fs.writeFile(path, 'content');

  const stdio: Stdio = {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr: mockWritable(),
  };

  const exitCode = await main(
    ['node', '/path/to/res-to-ts', path, '-o', '/path/to/output'],
    stdio
  );
  expect({
    exitCode,
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toEqual({
    exitCode: 1,
    stdout: ``,
    stderr: expect.stringContaining(
      `resource '${path}' is not in the root directory`
    ),
  });
});

test('convert text adjacent', async () => {
  const path = fileSync({ template: 'XXXXXX.txt' }).name;
  await fs.writeFile(path, 'content');

  const stdio: Stdio = {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr: mockWritable(),
  };

  const tsPath = getOutputPath(path);
  const exitCode = await main(['node', '/path/to/res-to-ts', path], stdio);
  expect({
    exitCode,
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toEqual({
    exitCode: 0,
    stdout: `📝 ${relativize(tsPath, process.cwd())}\n`,
    stderr: '',
  });

  const content = await fs.readFile(tsPath, 'utf8');
  expect(content).toContain(`const resourceDataBase64 = 'Y29udGVudA=='`);
  expect(content).toContain(`const mimeType = 'text/plain'`);
  expect(content).toContain(`export function asText()`);
  expect(content).not.toContain(`export async function asImage()`);
});

test('convert Election JSON adjacent', async () => {
  const path = fileSync({ template: 'election-XXXXXX.json' }).name;
  await fs.writeFile(path, '{}');

  const stdio: Stdio = {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr: mockWritable(),
  };

  const tsPath = getOutputPath(path);
  const exitCode = await main(['node', '/path/to/res-to-ts', path], stdio);
  expect({
    exitCode,
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toEqual({
    exitCode: 0,
    stdout: `📝 ${relativize(tsPath, process.cwd())}\n`,
    stderr: '',
  });

  const content = await fs.readFile(tsPath, 'utf8');
  expect(content).toContain(`const resourceDataBase64 = 'e30='`);
  expect(content).toContain(
    `SHA-256 hash of file data: 44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`
  );
  expect(content).toContain(`const mimeType = 'application/json'`);
  expect(content).toContain(`export function asText()`);
  expect(content).toContain(`export const electionDefinition =`);
  expect(content).not.toContain(`export async function asImage()`);
});

test('convert directory', async () => {
  const electionPath = fileSync({ template: 'election-XXXXXX.json' }).name;
  await fs.writeFile(electionPath, '{}');

  const directory = dirSync({ template: 'dir-XXXXXX' });
  const directoryPath = directory.name;

  const stdio: Stdio = {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr: mockWritable(),
  };

  const electionOutputPath = getOutputPath(electionPath);
  const directoryOutputPath = getOutputPath(directoryPath);
  const exitCode = await main(
    ['node', '/path/to/res-to-ts', electionPath, `${directoryPath}*`],
    stdio
  );
  expect({
    exitCode,
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toEqual({
    exitCode: 0,
    stdout: `📝 ${relativize(
      electionOutputPath,
      process.cwd()
    )}\n📝 ${relativize(directoryOutputPath, process.cwd())}\n`,
    stderr: '',
  });

  const content = await fs.readFile(directoryOutputPath, 'utf8');
  expect(content).toContain('export function asDirectoryPath(): string {');
});

test('convert unknown type adjacent', async () => {
  const path = fileSync({ template: 'XXXXXX' }).name;
  await fs.writeFile(path, 'content');

  const stdio: Stdio = {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr: mockWritable(),
  };

  const tsPath = getOutputPath(path);
  const exitCode = await main(['node', '/path/to/res-to-ts', path], stdio);
  expect({
    exitCode,
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toEqual({
    exitCode: 0,
    stdout: `📝 ${relativize(tsPath, process.cwd())}\n`,
    stderr: '',
  });

  const content = await fs.readFile(tsPath, 'utf8');
  expect(content).toContain(`const resourceDataBase64 = 'Y29udGVudA=='`);
  expect(content).toContain(`const mimeType = 'application/octet-stream'`);
  expect(content).not.toContain(`export async function asImage()`);
});

test('check success adjacent', async () => {
  const path = fileSync({ template: 'XXXXXX.jpeg' }).name;
  const tsPath = getOutputPath(path);
  await fs.writeFile(path, 'content');

  let stdio: Stdio = {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr: mockWritable(),
  };

  await main(['node', '/path/to/res-to-ts', path], stdio);

  expect({
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toEqual({
    stdout: `📝 ${relativize(tsPath, process.cwd())}\n`,
    stderr: '',
  });

  stdio = {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr: mockWritable(),
  };

  const exitCode = await main(
    ['node', '/path/to/res-to-ts', '--check', path],
    stdio
  );

  expect({
    exitCode,
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toEqual({
    exitCode: 0,
    stdout: `✅ ${relativize(tsPath, process.cwd())}\n`,
    stderr: '',
  });
});

test('check failure: no .ts file adjacent', async () => {
  const path = fileSync({ template: 'XXXXXX.jpeg' }).name;
  const tsPath = getOutputPath(path);
  await fs.writeFile(path, 'content');

  const stdio: Stdio = {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr: mockWritable(),
  };

  const exitCode = await main(
    ['node', '/path/to/res-to-ts', '--check', path],
    stdio
  );
  expect({
    exitCode,
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toEqual({
    exitCode: 1,
    stderr: `❌ ${relativize(tsPath, process.cwd())} is out of date\n`,
    stdout: '',
  });
});

test('check failure: .ts file outdated adjacent', async () => {
  const path = fileSync({ template: 'XXXXXX.jpeg' }).name;
  const tsPath = getOutputPath(path);
  await fs.writeFile(path, 'content');
  await fs.writeFile(tsPath, '/* outdated */');

  const stdio: Stdio = {
    stdin: mockReadable(),
    stdout: mockWritable(),
    stderr: mockWritable(),
  };

  const exitCode = await main(
    ['node', '/path/to/res-to-ts', '--check', path],
    stdio
  );
  expect({
    exitCode,
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toEqual({
    exitCode: 1,
    stderr: `❌ ${relativize(tsPath, process.cwd())} is out of date\n`,
    stdout: '',
  });
});
