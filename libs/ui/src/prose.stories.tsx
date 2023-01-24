import { LoremIpsum } from 'lorem-ipsum';
import { Meta } from '@storybook/react';

import { Prose, ProseProps } from './prose';

const initialProps: ProseProps = {
  children: new LoremIpsum({
    sentencesPerParagraph: { max: 5, min: 3 },
    wordsPerSentence: { max: 15, min: 10 },
  }).generateParagraphs(1),
};

const meta: Meta<typeof Prose> = {
  title: 'libs-ui/Prose',
  component: Prose,
  args: initialProps,
};

export default meta;

export { Prose };
