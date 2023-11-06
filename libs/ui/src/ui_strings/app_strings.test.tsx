import { AppStringKey, appStrings } from './app_strings';

// TODO(kofi): Quick-and-dirty placeholder -- convert to a lint check.
test('uiStringKeys match object keys', () => {
  for (const objectKey of Object.keys(appStrings)) {
    const renderedString = appStrings[objectKey as AppStringKey]();

    expect(renderedString.props.uiStringKey).toEqual(objectKey);
  }
});
