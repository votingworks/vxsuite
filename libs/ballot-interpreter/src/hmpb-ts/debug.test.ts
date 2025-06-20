import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { asSheet } from '@votingworks/types';
import { ImageData } from 'canvas';
import { beforeAll, expect, test, vi } from 'vitest';
import { pdfToPageImages } from '../../test/helpers/interpretation';
import * as addon from './addon';
import { interpret } from './interpret';

const { electionDefinition } = vxFamousNamesFixtures;

vi.mock('./addon');

const interpretImplMock = vi.mocked(addon.interpret);
let frontImageData!: ImageData;
let backImageData!: ImageData;

beforeAll(async () => {
  [frontImageData, backImageData] = asSheet(
    await pdfToPageImages(vxFamousNamesFixtures.markedBallotPath).toArray()
  );
});

test('no debug', () => {
  interpretImplMock.mockReturnValue({
    success: false,
    value: '{}',
  });

  void interpret(electionDefinition, ['a.jpeg', 'b.jpeg'], { debug: false });

  expect(interpretImplMock).toHaveBeenCalledWith(
    electionDefinition.election,
    'a.jpeg',
    'b.jpeg',
    undefined,
    undefined,
    expect.any(Object)
  );
});

test('empty debug paths', () => {
  interpretImplMock.mockReturnValue({
    success: false,
    value: '{}',
  });

  void interpret(
    electionDefinition,
    [frontImageData, backImageData],
    // @ts-expect-error -- intentionally passing invalid data
    { debugBasePaths: [] }
  );

  expect(interpretImplMock).toHaveBeenCalledWith(
    electionDefinition.election,
    frontImageData,
    backImageData,
    undefined,
    undefined,
    expect.any(Object)
  );
});

test('undefined debug paths', () => {
  interpretImplMock.mockReturnValue({
    success: false,
    value: '{}',
  });

  void interpret(electionDefinition, [frontImageData, backImageData], {
    debugBasePaths: undefined,
  });

  expect(interpretImplMock).toHaveBeenCalledWith(
    electionDefinition.election,
    frontImageData,
    backImageData,
    undefined,
    undefined,
    expect.any(Object)
  );
});

test('debug with image paths', () => {
  interpretImplMock.mockReturnValue({
    success: false,
    value: '{}',
  });

  void interpret(electionDefinition, ['a.jpeg', 'b.jpeg'], { debug: true });

  expect(interpretImplMock).toHaveBeenCalledWith(
    electionDefinition.election,
    'a.jpeg',
    'b.jpeg',
    'a.jpeg',
    'b.jpeg',
    expect.any(Object)
  );
});

test('debug with image data', () => {
  interpretImplMock.mockReturnValue({
    success: false,
    value: '{}',
  });

  void interpret(electionDefinition, [frontImageData, backImageData], {
    debugBasePaths: ['a.jpeg', 'b.jpeg'],
  });

  expect(interpretImplMock).toHaveBeenCalledWith(
    electionDefinition.election,
    frontImageData,
    backImageData,
    'a.jpeg',
    'b.jpeg',
    expect.any(Object)
  );
});
