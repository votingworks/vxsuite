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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Component {...props} color={undefined} />
      <Component {...props} color="neutral" />
      <Component {...props} color="primary" />
      <Component {...props} color="warning" />
      <Component {...props} color="danger" />
    </div>
  );
}
