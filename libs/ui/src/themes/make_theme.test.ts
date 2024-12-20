import { ColorMode, ColorString, SizeMode } from '@votingworks/types';

import { DesktopPalette, TouchscreenPalette, makeTheme } from './make_theme';

test('defaults', () => {
  const theme = makeTheme({});

  expect<ColorMode>(theme.colorMode).toEqual('contrastMedium');
  expect<SizeMode>(theme.sizeMode).toEqual('touchSmall');
  expect<ColorString>(theme.colors.background).toEqual(
    TouchscreenPalette.Gray5
  );
  expect<ColorString>(theme.colors.onBackground).toEqual(
    TouchscreenPalette.Gray90
  );
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
    colorMode: 'desktop',
    screenType: 'builtIn',
    sizeMode: 'desktop',
  });

  expect(desktopTheme.colors.background).toEqual(DesktopPalette.Gray0);
  expect(desktopTheme.sizes.fontDefault).toEqual(16);

  const lenovoDesktopTheme = makeTheme({
    colorMode: 'contrastMedium',
    screenType: 'lenovoThinkpad15',
    sizeMode: 'desktop',
  });

  expect(lenovoDesktopTheme.sizes.fontDefault).toEqual(30);
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

test('ignores screen type for print theme', () => {
  const elo13PrintTheme = makeTheme({
    colorMode: 'print',
    screenType: 'elo13',
    sizeMode: 'print',
  });
  const elo15PrintTheme = makeTheme({
    colorMode: 'print',
    screenType: 'elo15',
    sizeMode: 'print',
  });
  const thinkpad15PrintTheme = makeTheme({
    colorMode: 'print',
    screenType: 'lenovoThinkpad15',
    sizeMode: 'print',
  });

  expect(elo13PrintTheme.sizes).toEqual(elo15PrintTheme.sizes);
  expect(elo15PrintTheme.sizes).toEqual(thinkpad15PrintTheme.sizes);
});
