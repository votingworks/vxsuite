/* eslint-disable react/no-unescaped-entities */
import React from 'react';
import { LoremIpsum } from 'lorem-ipsum';
import { Meta } from '@storybook/react';

import {
  Caption,
  Font,
  H1,
  H2,
  H3,
  H4,
  H5,
  H6,
  P,
  FontProps,
  HeadingProps,
} from './typography';

const loremIpsum = new LoremIpsum({
  sentencesPerParagraph: { max: 8, min: 4 },
  wordsPerSentence: { max: 8, min: 4 },
});

const meta: Meta<typeof Font> = {
  title: 'libs-ui/Typography',
  component: Font,
  args: {
    children: 'Sample text',
  },
};

export default meta;

const testParagraph1 = loremIpsum.generateParagraphs(1);
const testParagraph2 = loremIpsum.generateParagraphs(1);
const testParagraph3 = loremIpsum.generateParagraphs(1);

export function Typography(props: FontProps): JSX.Element {
  return (
    <React.Fragment>
      <H1 {...props}>H1. Typography</H1>
      <P {...props} weight="regular">
        P. This library provides standardized typography components for
        rendering textual UI elements with common formatting options.
      </P>
      <P {...props} weight="regular">
        P. It includes a few basic semantic text types (e.g., P, H1, H2, etc) as
        well as a Font component for styling inline text. These follow the same
        nesting rules as their default browser equivalents and may optionally be{' '}
        <Font weight="bold">highlighted</Font> or{' '}
        <Font weight="light">de-emphasized</Font> via the `weight` prop and/or{' '}
        <Font italic>emphasized</Font> via the `italic` prop.
      </P>
      <Caption {...props}>
        Caption. The Caption component may be used for smaller secondary text
        and footnotes.
      </Caption>
      <H2 {...props}>H2. Accessibility</H2>
      <P {...props}>
        P. Every page should contain at least one H1 heading element and heading
        levels should only increase by one. E.g., there shouldn't be an H3
        element on the page if an H2 hasn't been rendered before it.
      </P>
      <P {...props}>
        P. There might be cases where, for example, an H4-sized heading is
        needed at the level of an H2 &mdash; heading components provide an{' '}
        <Font weight="bold">`as`</Font> prop to enable changing the semantic tag
        of one heading size to another, in order to preserve heading hierarchy.
        <br />
        <Caption {...props}>e.g., {`<H4 as="h2">Hello World</H4>`}</Caption>
      </P>
      <P {...props}>
        P. See{' '}
        <a
          href="https://www.w3.org/WAI/tutorials/page-structure/headings"
          target="_blank"
          rel="noreferrer"
        >
          w3 documentation
        </a>{' '}
        on headings for more info.
      </P>
      <H3 {...props}>H3. Heading</H3>
      <P {...props}>P. {testParagraph1}</P>
      <H4 {...props}>H4. Heading</H4>
      <P {...props}>P. {testParagraph1}</P>
      <H5 {...props}>H5. Heading</H5>
      <P {...props}>P. {testParagraph1}</P>
      <H6 {...props}>H6. Heading</H6>
      <P {...props}>P. {testParagraph1}</P>
    </React.Fragment>
  );
}

export { Caption };

export function font(props: FontProps): JSX.Element {
  return (
    <P>
      Here's an example of an <Font {...props} /> that can be modified
      separately from its parent text.
    </P>
  );
}
font.args = {
  children: 'inline <Font> component',
  weight: 'bold',
};

const additionalHeadingArgTypes = {
  as: {
    options: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    control: { type: 'radio' },
  },
} as const;

export function h1(props: HeadingProps): JSX.Element {
  return <H1 {...props} />;
}
h1.argTypes = additionalHeadingArgTypes;

export function h2(props: HeadingProps): JSX.Element {
  return <H2 {...props} />;
}
h2.argTypes = additionalHeadingArgTypes;

export function h3(props: HeadingProps): JSX.Element {
  return <H3 {...props} />;
}
h3.argTypes = additionalHeadingArgTypes;

export function h4(props: HeadingProps): JSX.Element {
  return <H4 {...props} />;
}
h4.argTypes = additionalHeadingArgTypes;

export function h5(props: HeadingProps): JSX.Element {
  return <H5 {...props} />;
}
h5.argTypes = additionalHeadingArgTypes;

export function h6(props: HeadingProps): JSX.Element {
  return <H6 {...props} />;
}
h6.argTypes = additionalHeadingArgTypes;

export function p(props: FontProps): JSX.Element {
  return (
    <React.Fragment>
      <P {...props} />
      <P {...props}>{testParagraph2}</P>
      <P {...props}>{testParagraph3}</P>
    </React.Fragment>
  );
}
p.args = {
  children: testParagraph1,
};
