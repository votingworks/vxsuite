import { afterEach, beforeEach, expect, test } from 'vitest';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScreenRecordingFile } from './screen_recording.js';

let workDir: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(join(tmpdir(), 'screen-recording-test-'));
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

test('appends chunks and saves the recording', async () => {
  const recordingFile = new ScreenRecordingFile();
  await recordingFile.begin();
  await recordingFile.append(new TextEncoder().encode('chunk 1, '));
  await recordingFile.append(new TextEncoder().encode('chunk 2'));

  const destinationPath = join(workDir, 'recording.mp4');
  await recordingFile.save(destinationPath);
  expect(fs.readFileSync(destinationPath, 'utf8')).toEqual('chunk 1, chunk 2');
  await expect(
    recordingFile.append(new TextEncoder().encode('more'))
  ).rejects.toThrow();
});

test('beginning again starts a fresh recording', async () => {
  const recordingFile = new ScreenRecordingFile();
  await recordingFile.begin();
  await recordingFile.append(new TextEncoder().encode('old'));
  await recordingFile.begin();
  await recordingFile.append(new TextEncoder().encode('new'));

  const destinationPath = join(workDir, 'recording.webm');
  await recordingFile.save(destinationPath);
  expect(fs.readFileSync(destinationPath, 'utf8')).toEqual('new');
});

test('discarding removes the recording', async () => {
  const recordingFile = new ScreenRecordingFile();
  await recordingFile.discard();
  await recordingFile.begin();
  await recordingFile.discard();
  await expect(recordingFile.save(join(workDir, 'x.mp4'))).rejects.toThrow();
});
