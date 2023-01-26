import { Color, ColorMode, SizeMode } from '@votingworks/types';

import { makeTheme } from './make_theme';

test('defaults to "legacy" modes', () => {
  const theme = makeTheme({});

  expect<ColorMode>(theme.colorMode).toEqual('legacy');
  expect<SizeMode>(theme.sizeMode).toEqual('legacy');
  expect<Color>(theme.colors.background).toEqual(Color.LEGACY_BACKGROUND);
  expect<Color>(theme.colors.foreground).toEqual(Color.LEGACY_FOREGROUND);
});

test('varies theme based on selected modes', () => {
  const lightThemeS = makeTheme({
    colorMode: 'contrastHighLight',
    sizeMode: 's',
  });
  const darkThemeXl = makeTheme({
    colorMode: 'contrastHighDark',
    sizeMode: 'xl',
  });

  expect<ColorMode>(lightThemeS.colorMode).toEqual('contrastHighLight');
  expect<SizeMode>(lightThemeS.sizeMode).toEqual('s');

  expect<ColorMode>(darkThemeXl.colorMode).toEqual('contrastHighDark');
  expect<SizeMode>(darkThemeXl.sizeMode).toEqual('xl');

  expect<Color>(lightThemeS.colors.background).not.toEqual(
    darkThemeXl.colors.background
  );
  expect<number>(lightThemeS.sizes.fontDefault).not.toEqual(
    darkThemeXl.sizes.fontDefault
  );
});
