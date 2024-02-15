import {
  ROBOTO_REGULAR_FONT_DECLARATIONS,
  ROBOTO_ITALIC_FONT_DECLARATIONS,
} from '@votingworks/ui';

const globalStyles = `
  *,
  *::before,
  *::after {
    box-sizing: inherit;
  }

  html {
    box-sizing: border-box;
    font-family: Vx Roboto;
  }

  body {
    margin: 0;
  }
`;

export const globalStyleElements = (
  <>
    <style
      type="text/css"
      dangerouslySetInnerHTML={{
        __html: [
          ROBOTO_REGULAR_FONT_DECLARATIONS,
          ROBOTO_ITALIC_FONT_DECLARATIONS,
        ].join('\n'),
      }}
    />
    <style
      type="text/css"
      dangerouslySetInnerHTML={{
        __html: globalStyles,
      }}
    />
  </>
);
