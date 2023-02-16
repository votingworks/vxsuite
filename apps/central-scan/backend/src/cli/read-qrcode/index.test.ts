import { sampleBallotImages } from '@votingworks/fixtures';
import { fakeReadable, fakeWritable } from '@votingworks/test-utils';
import { IO, main } from '.';

test('help', async () => {
  const stdin = fakeReadable();
  const stdout = fakeWritable();
  const stderr = fakeWritable();
  const io: IO = { stdin, stdout, stderr };

  expect(await main(['node', 'read-qrcode', '-h'], io)).toEqual(0);

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

  expect(await main(['node', 'read-qrcode'], io)).toEqual(0);

  expect(stdout.toString()).toMatchInlineSnapshot(`""`);
});

test('invalid option', async () => {
  const stdin = fakeReadable();
  const stdout = fakeWritable();
  const stderr = fakeWritable();
  const io: IO = { stdin, stdout, stderr };

  expect(await main(['node', 'read-qrcode', '--invalid-option'], io)).toEqual(
    1
  );

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
    ['node', 'read-qrcode', sampleBallotImages.notBallot.asFilePath()],
    io
  );

  expect(stdout.toString()).toContain('no QR code detected');
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
      sampleBallotImages.sampleBatch1Ballot1.asFilePath(),
    ],
    io
  );

  expect(stdout.toString()).toContain(
    '@top via qrdetect: VlgCtS6fRyi7NOf/SAMDFgggAAEA'
  );
});
