import { Color, ColorMode, ColorString, SizeMode } from '@votingworks/types';

import { makeTheme } from './make_theme';

test('defaults', () => {
  const theme = makeTheme({});

  expect<ColorMode>(theme.colorMode).toEqual('contrastMedium');
  expect<SizeMode>(theme.sizeMode).toEqual('touchSmall');
  expect<ColorString>(theme.colors.background).toEqual(Color.OFF_WHITE);
  expect<ColorString>(theme.colors.foreground).toEqual(Color.GRAY_DARK);
});

test('varies theme based on selected modes', () => {
  const lightThemeS = makeTheme({
    colorMode: 'contrastHighLight',
    sizeMode: 'touchSmall',
  });
  const darkThemeXl = makeTheme({
    colorMode: 'contrastHighDark',
    sizeMode: 'touchExtraLarge',
  });

  expect<ColorMode>(lightThemeS.colorMode).toEqual('contrastHighLight');
  expect<SizeMode>(lightThemeS.sizeMode).toEqual('touchSmall');

  expect<ColorMode>(darkThemeXl.colorMode).toEqual('contrastHighDark');
  expect<SizeMode>(darkThemeXl.sizeMode).toEqual('touchExtraLarge');

  expect<ColorString>(lightThemeS.colors.background).not.toEqual(
    darkThemeXl.colors.background
  );
  expect<number>(lightThemeS.sizes.fontDefault).not.toEqual(
    darkThemeXl.sizes.fontDefault
  );
});

test('desktop theme', () => {
  const desktopTheme = makeTheme({
    colorMode: 'contrastMedium',
    screenType: 'builtIn',
    sizeMode: 'desktop',
  });

  expect<number>(desktopTheme.sizes.fontDefault).toEqual(16);
});

test('varies sizes based on screen type', () => {
  const elo13ScreenTheme = makeTheme({
    colorMode: 'contrastMedium',
    screenType: 'elo13',
    sizeMode: 'touchSmall',
  });
  const elo15ScreenTheme = makeTheme({
    colorMode: 'contrastMedium',
    screenType: 'elo15',
    sizeMode: 'touchSmall',
  });
  const thinkpad15ScreenTheme = makeTheme({
    colorMode: 'contrastMedium',
    screenType: 'lenovoThinkpad15',
    sizeMode: 'touchSmall',
  });

  expect(elo13ScreenTheme.sizes).not.toEqual(elo15ScreenTheme.sizes);
  expect(elo15ScreenTheme.sizes).not.toEqual(thinkpad15ScreenTheme.sizes);
});
