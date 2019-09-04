// Ported to TypeScript from:
// https://github.com/joaquimserafim/isJSON/blob/master/test/index.js

import isJSON, { isJSONStrict } from './isJSON'

it('perform isJSON verifications', () => {
  expect(isJSON('asdada[]asdadada sd asdasda das das')).toBeFalsy()
  expect(isJSON(null)).toBeFalsy() // eslint-disable-line no-null/no-null
  expect(isJSON(false)).toBeFalsy()
  expect(isJSON('')).toBeFalsy()
  expect(isJSON('normal string')).toBeFalsy()
  expect(isJSON(2014)).toBeFalsy()
  expect(isJSON(2014.5)).toBeFalsy()
  expect(isJSON([1, 2, 3, 4])).toBeFalsy()
  expect(
    isJSON({
      a: 12,
      b: [1, 2, 3],
    })
  ).toBeFalsy()
  expect(
    isJSON(
      {
        a: 12,
        b: [1, 2, 3],
      },
      true
    )
  ).toBeTruthy()
  expect(
    isJSON('{"a":"obja","b":[0,1,2],"c":{"d":"some object"}}')
  ).toBeTruthy()
  expect(isJSON('1,2,3')).toBeFalsy()
  expect(isJSON('{1,2,3}')).toBeFalsy()
  expect(isJSON('[{"a": 123}, {1,2,3}}]')).toBeFalsy()
  expect(
    isJSON(
      '[{"a": {"aa": [1,2,3,4], "aaa": {"d": 1212}}}, {"b": "test", "c": [1,2,3], "date": "' +
        new Date() +
        '"}]'
    )
  ).toBeTruthy()

  expect(isJSON(new Date())).toBeFalsy()
  expect(isJSONStrict('{\n "config": 123,\n "test": "abcde" \n}')).toBeTruthy()
  expect(
    isJSONStrict({
      a: 1,
    })
  ).toBeTruthy()
  expect(isJSONStrict('asdf')).toBeFalsy()
  expect(isJSONStrict(true)).toBeFalsy()
})
