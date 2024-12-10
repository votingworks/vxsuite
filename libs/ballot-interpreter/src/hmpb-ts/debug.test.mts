import { beforeAll, expect, test, vi } from 'vitest';
import { ImageData } from 'canvas';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import * as addon from './addon.js';
import { interpret } from './interpret.js';

vi.mock('./addon.js');

const interpretImplMock = vi.mocked(addon.interpret);
let frontImageData!: ImageData;
let backImageData!: ImageData;

beforeAll(async () => {
  frontImageData =
    await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedFront.asImageData();
  backImageData =
    await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedBack.asImageData();
});

test('no debug', () => {
  interpretImplMock.mockReturnValue({
    success: false,
    value: '{}',
  });

  void interpret(
    electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition,
    ['a.jpeg', 'b.jpeg'],
    { debug: false }
  );

  expect(interpretImplMock).toHaveBeenCalledWith(
    electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition
      .election,
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
    electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition,
    [frontImageData, backImageData],
    // @ts-expect-error -- intentionally passing invalid data
    { debugBasePaths: [] }
  );

  expect(interpretImplMock).toHaveBeenCalledWith(
    electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition
      .election,
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

  void interpret(
    electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition,
    [frontImageData, backImageData],
    { debugBasePaths: undefined }
  );

  expect(interpretImplMock).toHaveBeenCalledWith(
    electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition
      .election,
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

  void interpret(
    electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition,
    ['a.jpeg', 'b.jpeg'],
    { debug: true }
  );

  expect(interpretImplMock).toHaveBeenCalledWith(
    electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition
      .election,
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

  void interpret(
    electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition,
    [frontImageData, backImageData],
    { debugBasePaths: ['a.jpeg', 'b.jpeg'] }
  );

  expect(interpretImplMock).toHaveBeenCalledWith(
    electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition
      .election,
    frontImageData,
    backImageData,
    'a.jpeg',
    'b.jpeg',
    expect.any(Object)
  );
});
