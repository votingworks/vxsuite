import React from 'react';
import {
  ROBOTO_REGULAR_FONT_DECLARATIONS,
  ROBOTO_ITALIC_FONT_DECLARATIONS,
} from '@votingworks/ui';

export interface BaseStylesProps {
  compact?: boolean;
}

export function baseLineHeight(compact?: boolean): number {
  return compact ? 1.1 : 1.2;
}

export function baseStyles(params: BaseStylesProps): string {
  const { compact } = params;

  return `
  *,
  *::before,
  *::after {
    box-sizing: inherit;
  }

  html {
    box-sizing: border-box;
    font-family: Vx Roboto;
    font-variant-ligatures: none;
    /*
     * 12pt is the Center for Civic Design's recommended default font size, and
     * 10pt is their recommended minimum accessible font size.
     */
    font-size: ${compact ? 11 : 12}pt;
    line-height: ${baseLineHeight(compact)};
  }

  body {
    margin: 0;
  }

  h1, h2, h3, h4, h5, h6 {
    margin: 0;
  }
  h1 {
    font-size: 1.4em;
  }
  h2 {
    font-size: 1.2em;
  }
  h3 {
    font-size: 1.1em;
  }
  h4 {
    font-size: 1em;
  }
  h5 {
    font-size: 1em;
  }
  h6 {
    font-size: 1em;
  }

  ul, ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }
`;
}
export function BaseStyles(props: BaseStylesProps): JSX.Element {
  return (
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
          __html: baseStyles(props),
        }}
      />
    </>
  );
}
