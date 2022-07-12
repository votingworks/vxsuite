import { fakeReadable, fakeWritable } from '@votingworks/test-utils';
import { join, relative } from 'path';
import { IO, main } from '.';

test('help', async () => {
  const stdin = fakeReadable();
  const stdout = fakeWritable();
  const stderr = fakeWritable();
  const io: IO = { stdin, stdout, stderr };

  expect(await main(['node', 'read-qrcode', '-h'], io)).toBe(0);

  expect(stdout.toString()).toMatchInlineSnapshot(`
    "read-qrcode [IMAGE_PATH …]
    "
  `);
});

test('no args', async () => {
  const stdin = fakeReadable();
  const stdout = fakeWritable();
  const stderr = fakeWritable();
  const io: IO = { stdin, stdout, stderr };

  expect(await main(['node', 'read-qrcode'], io)).toBe(0);

  expect(stdout.toString()).toMatchInlineSnapshot(`""`);
});

test('invalid option', async () => {
  const stdin = fakeReadable();
  const stdout = fakeWritable();
  const stderr = fakeWritable();
  const io: IO = { stdin, stdout, stderr };

  expect(await main(['node', 'read-qrcode', '--invalid-option'], io)).toBe(1);

  expect(stdout.toString()).toMatchInlineSnapshot(`""`);
  expect(stderr.toString()).toMatchInlineSnapshot(`
    "error: unrecognized option: --invalid-option
    read-qrcode [IMAGE_PATH …]
    "
  `);
});

test('image with no QR code', async () => {
  const stdin = fakeReadable();
  const stdout = fakeWritable();
  const stderr = fakeWritable();
  const io: IO = { stdin, stdout, stderr };

  await main(
    [
      'node',
      'read-qrcode',
      relative(
        join(__dirname, '../../..'),
        join(__dirname, '../../../sample-ballot-images/not-a-ballot.jpg')
      ),
    ],
    io
  );

  expect(stdout.toString()).toMatchInlineSnapshot(`
    "sample-ballot-images/not-a-ballot.jpg: no QR code detected
    "
  `);
});

test('image with a QR code', async () => {
  const stdin = fakeReadable();
  const stdout = fakeWritable();
  const stderr = fakeWritable();
  const io: IO = { stdin, stdout, stderr };

  await main(
    [
      'node',
      'read-qrcode',
      relative(
        join(__dirname, '../../..'),
        join(
          __dirname,
          '../../../sample-ballot-images/sample-batch-1-ballot-1.png'
        )
      ),
    ],
    io
  );

  expect(stdout.toString()).toMatchInlineSnapshot(`
    "sample-ballot-images/sample-batch-1-ballot-1.png @top via qrdetect: VlgCtS6fRyi7NOf/SAMDFgggAAEA
    "
  `);
});
