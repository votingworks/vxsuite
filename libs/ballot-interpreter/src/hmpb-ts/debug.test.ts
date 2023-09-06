import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
// eslint-disable-next-line import/no-unresolved -- `./rust_addon` is a native module
import { interpret as interpretImpl } from './rust_addon';
import { interpret } from './interpret';

jest.mock('./rust_addon');

const interpretImplMock = interpretImpl as jest.MockedFunction<
  typeof interpretImpl
>;

let frontImageData!: ImageData;
let backImageData!: ImageData;

beforeAll(async () => {
  frontImageData =
    await electionGridLayoutNewHampshireAmherstFixtures.scanMarkedFront.asImageData();
  backImageData =
    await electionGridLayoutNewHampshireAmherstFixtures.scanMarkedBack.asImageData();
});

test('no debug', () => {
  interpretImplMock.mockReturnValue({
    success: false,
    value: '{}',
  });

  void interpret(
    electionGridLayoutNewHampshireAmherstFixtures.electionDefinition,
    ['a.jpeg', 'b.jpeg'],
    { debug: false }
  );

  expect(interpretImplMock).toHaveBeenCalledWith(
    electionGridLayoutNewHampshireAmherstFixtures.electionDefinition.election,
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
    electionGridLayoutNewHampshireAmherstFixtures.electionDefinition,
    [frontImageData, backImageData],
    // @ts-expect-error -- intentionally passing invalid data
    { debugBasePaths: [] }
  );

  expect(interpretImplMock).toHaveBeenCalledWith(
    electionGridLayoutNewHampshireAmherstFixtures.electionDefinition.election,
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
    electionGridLayoutNewHampshireAmherstFixtures.electionDefinition,
    [frontImageData, backImageData],
    { debugBasePaths: undefined }
  );

  expect(interpretImplMock).toHaveBeenCalledWith(
    electionGridLayoutNewHampshireAmherstFixtures.electionDefinition.election,
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
    electionGridLayoutNewHampshireAmherstFixtures.electionDefinition,
    ['a.jpeg', 'b.jpeg'],
    { debug: true }
  );

  expect(interpretImplMock).toHaveBeenCalledWith(
    electionGridLayoutNewHampshireAmherstFixtures.electionDefinition.election,
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
    electionGridLayoutNewHampshireAmherstFixtures.electionDefinition,
    [frontImageData, backImageData],
    { debugBasePaths: ['a.jpeg', 'b.jpeg'] }
  );

  expect(interpretImplMock).toHaveBeenCalledWith(
    electionGridLayoutNewHampshireAmherstFixtures.electionDefinition.election,
    frontImageData,
    backImageData,
    'a.jpeg',
    'b.jpeg',
    expect.any(Object)
  );
});
