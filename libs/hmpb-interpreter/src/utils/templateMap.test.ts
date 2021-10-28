import { BallotType, BallotPageLayout } from '@votingworks/types';
import { createImageData } from './canvas';
import { templateMap, TemplateMapKey } from './templateMap';

test('no locale info', () => {
  const map = templateMap();
  const layout: BallotPageLayout = {
    ballotImage: {
      imageData: createImageData(1, 1),
      metadata: {
        ballotStyleId: '1',
        ballotType: BallotType.Standard,
        electionHash: 'abc',
        isTestMode: false,
        locales: { primary: '' },
        pageNumber: 1,
        precinctId: '2',
      },
    },
    contests: [],
  };
  const key: TemplateMapKey = [undefined, '1', '2', 1];
  map.set(key, layout);
  expect(map.get(key)).toBe(layout);
  expect(map.get([{ primary: 'en-US' }, '1', '2', 1])).toBeUndefined();
});

test('with primary-only locale info', () => {
  const map = templateMap();
  const layout: BallotPageLayout = {
    ballotImage: {
      imageData: createImageData(1, 1),
      metadata: {
        ballotStyleId: '1',
        ballotType: BallotType.Standard,
        electionHash: 'abc',
        isTestMode: false,
        locales: { primary: 'en-US' },
        pageNumber: 1,
        precinctId: '2',
      },
    },
    contests: [],
  };
  const key: TemplateMapKey = [{ primary: 'en-US' }, '1', '2', 1];
  map.set(key, layout);
  expect(map.get(key)).toBe(layout);
  expect(map.get([undefined, '1', '2', 1])).toBeUndefined();
});

test('with primary+secondary locale info', () => {
  const map = templateMap();
  const layout: BallotPageLayout = {
    ballotImage: {
      imageData: createImageData(1, 1),
      metadata: {
        ballotStyleId: '1',
        ballotType: BallotType.Standard,
        electionHash: 'abc',
        isTestMode: false,
        locales: { primary: 'en-US', secondary: 'es-US' },
        pageNumber: 1,
        precinctId: '2',
      },
    },
    contests: [],
  };
  const key: TemplateMapKey = [
    { primary: 'en-US', secondary: 'es-US' },
    '1',
    '2',
    1,
  ];
  map.set(key, layout);
  expect(map.get(key)).toBe(layout);
  expect(map.get([{ primary: 'en-US' }, '1', '2', 1])).toBeUndefined();
});
