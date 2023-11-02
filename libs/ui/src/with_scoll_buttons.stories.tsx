import { Meta, StoryFn } from '@storybook/react';

import { LoremIpsum } from 'lorem-ipsum';
import styled from 'styled-components';
import {
  WithScrollButtons,
  WithScrollButtonsProps,
} from './with_scroll_buttons';
import { H1 } from './typography';
import { Card } from './card';

const loremIpsum = new LoremIpsum();

const initialArgs: Partial<WithScrollButtonsProps> = {
  children: (
    <div>
      <H1>Content goes here:</H1>
      <Card>{loremIpsum.generateParagraphs(1)}</Card>
      <Card>{loremIpsum.generateParagraphs(1)}</Card>
      <Card>{loremIpsum.generateParagraphs(1)}</Card>
      <Card>{loremIpsum.generateParagraphs(1)}</Card>
      <Card>{loremIpsum.generateParagraphs(1)}</Card>
    </div>
  ),
};

const FixedHeightContainer = styled.div`
  height: 75vh;
  border: 1px dashed ${(p) => p.theme.colors.onBackground};
`;

const meta: Meta<typeof WithScrollButtons> = {
  title: 'libs-ui/WithScrollButtons',
  component: WithScrollButtons,
  args: initialArgs,
  decorators: [
    (StoryContent: StoryFn): JSX.Element => (
      <FixedHeightContainer>
        <StoryContent />
      </FixedHeightContainer>
    ),
  ],
};

export default meta;

export { WithScrollButtons };
