import { BallotType, BallotPageLayoutWithImage } from '@votingworks/types';
import { createImageData } from 'canvas';
import { templateMap, TemplateMapKey } from './template_map';

test('no locale info', () => {
  const map = templateMap();
  const layout: BallotPageLayoutWithImage = {
    imageData: createImageData(1, 1),
    ballotPageLayout: {
      pageSize: { width: 1, height: 1 },
      metadata: {
        ballotStyleId: '1',
        ballotType: BallotType.Standard,
        electionHash: 'abc',
        isTestMode: false,
        locales: { primary: '' },
        pageNumber: 1,
        precinctId: '2',
      },
      contests: [],
    },
  };
  const key: TemplateMapKey = [undefined, '1', '2', 1];
  map.set(key, layout);
  expect(map.get(key)).toEqual(layout);
  expect(map.get([{ primary: 'en-US' }, '1', '2', 1])).toBeUndefined();
});

test('with primary-only locale info', () => {
  const map = templateMap();
  const layout: BallotPageLayoutWithImage = {
    imageData: createImageData(1, 1),
    ballotPageLayout: {
      pageSize: { width: 1, height: 1 },
      metadata: {
        ballotStyleId: '1',
        ballotType: BallotType.Standard,
        electionHash: 'abc',
        isTestMode: false,
        locales: { primary: 'en-US' },
        pageNumber: 1,
        precinctId: '2',
      },
      contests: [],
    },
  };
  const key: TemplateMapKey = [{ primary: 'en-US' }, '1', '2', 1];
  map.set(key, layout);
  expect(map.get(key)).toEqual(layout);
  expect(map.get([undefined, '1', '2', 1])).toBeUndefined();
});

test('with primary+secondary locale info', () => {
  const map = templateMap();
  const layout: BallotPageLayoutWithImage = {
    imageData: createImageData(1, 1),
    ballotPageLayout: {
      pageSize: { width: 1, height: 1 },
      metadata: {
        ballotStyleId: '1',
        ballotType: BallotType.Standard,
        electionHash: 'abc',
        isTestMode: false,
        locales: { primary: 'en-US', secondary: 'es-US' },
        pageNumber: 1,
        precinctId: '2',
      },
      contests: [],
    },
  };
  const key: TemplateMapKey = [
    { primary: 'en-US', secondary: 'es-US' },
    '1',
    '2',
    1,
  ];
  map.set(key, layout);
  expect(map.get(key)).toEqual(layout);
  expect(map.get([{ primary: 'en-US' }, '1', '2', 1])).toBeUndefined();
});
