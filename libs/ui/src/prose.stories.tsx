import React from 'react';
import { LoremIpsum } from 'lorem-ipsum';
import { Meta } from '@storybook/react';

import { Prose, ProseProps } from './prose';

const loremIpsum = new LoremIpsum({
  sentencesPerParagraph: { max: 8, min: 5 },
  wordsPerSentence: { max: 8, min: 5 },
});

const initialProps: ProseProps = {
  children: (
    <React.Fragment>
      <h1>{'<h1>'} Heading</h1>
      <h2>{'<h2>'} Heading</h2>
      <h3>{'<h3>'} Heading</h3>
      <h4>{'<h4>'} Heading</h4>
      <h5>{'<h5>'} Heading</h5>
      <h6>{'<h6>'} Heading</h6>
      <p>
        {'<p>'}
        {loremIpsum.generateParagraphs(1)}
      </p>
      <p>
        {'<p>'}
        {loremIpsum.generateParagraphs(1)}
      </p>
      <ul>
        {'<ul>'} Unordered List
        <li>{loremIpsum.generateWords(2)}</li>
        <li>{loremIpsum.generateWords(2)}</li>
        <li>{loremIpsum.generateWords(2)}</li>
        <li>{loremIpsum.generateWords(2)}</li>
      </ul>
      <ol>
        {'<ol>'} Ordered List
        <li>{loremIpsum.generateWords(2)}</li>
        <li>{loremIpsum.generateWords(2)}</li>
        <li>{loremIpsum.generateWords(2)}</li>
        <li>{loremIpsum.generateWords(2)}</li>
      </ol>
    </React.Fragment>
  ),
};

const meta: Meta<typeof Prose> = {
  title: 'libs-ui/Prose',
  component: Prose,
  args: initialProps,
};

export default meta;

export { Prose };
