import React from 'react';
import { Meta } from '@storybook/react';

import { LoremIpsum } from 'lorem-ipsum';
import { Card as Component, CardProps as Props } from './card';

const loremIpsum = new LoremIpsum({
  sentencesPerParagraph: { max: 8, min: 4 },
  wordsPerSentence: { max: 8, min: 4 },
});

const initialProps: Props = {
  children: loremIpsum.generateParagraphs(1),
  footer: 'Look, a footer!',
  footerAlign: 'left',
};

const meta: Meta<typeof Component> = {
  title: 'libs-ui/Card',
  component: Component,
  args: initialProps,
};

export default meta;

export function Card(props: Props): JSX.Element {
  return (
    <div>
      <Component {...props} />
      <Component {...props} />
      <Component {...props} />
    </div>
  );
}
