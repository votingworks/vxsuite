import React from 'react';
import { Meta } from '@storybook/react';
import { LoremIpsum } from 'lorem-ipsum';

import { Button, ButtonProps } from './button';
import { Caption, H1, H4, P } from './typography';
import { Card } from './card';

const loremIpsum = new LoremIpsum({
  sentencesPerParagraph: { max: 3, min: 3 },
  wordsPerSentence: { max: 8, min: 3 },
});

const testSentence = loremIpsum.generateSentences(1);
const testParagraph = loremIpsum.generateParagraphs(1);

const initialProps: Partial<React.ComponentProps<typeof Button>> = {
  children: 'Click me',
};

const meta: Meta<typeof Button> = {
  title: 'libs-ui/Button',
  component: Button,
  args: initialProps,
  argTypes: {
    onPress: {},
  },
};

export default meta;

export function UsageExamples(props: ButtonProps<unknown>): JSX.Element {
  const [fakeTextInputValue, setFakeTextInputValue] =
    React.useState<string>('');

  return (
    <React.Fragment>
      <H1>Button Examples</H1>

      <Card
        footerAlign="right"
        footer={
          <React.Fragment>
            <Button {...props} variant="previous">
              Previous
            </Button>
            <Button {...props} variant="done">
              Save and exit
            </Button>
          </React.Fragment>
        }
      >
        <H4 as="h2">All done!</H4>
        <P>{testParagraph}</P>
      </Card>

      <Card
        footerAlign="right"
        footer={
          <React.Fragment>
            <Button {...props}>Cancel</Button>
            <Button {...props} variant="danger">
              Delete everything
            </Button>
          </React.Fragment>
        }
      >
        <H4 as="h2">Are you sure?</H4>
        <P>{testParagraph}</P>
      </Card>

      <Card
        footerAlign="right"
        footer={
          <React.Fragment>
            <Button {...props}>Cancel</Button>
            <Button {...props} variant="warning">
              Fix the thing
            </Button>
          </React.Fragment>
        }
      >
        <H4 as="h2">Warning! You forgot something.</H4>
        <P>{testParagraph}</P>
      </Card>

      <Card
        footerAlign="right"
        footer={
          <React.Fragment>
            <Button {...props}>Cancel</Button>
            <Button
              {...props}
              disabled={fakeTextInputValue.length < 2}
              variant="next"
            >
              Continue
            </Button>
          </React.Fragment>
        }
      >
        <H4 as="h2">Fill out the form to continue:</H4>
        <P>{testParagraph}</P>
        <P>
          <label>
            Your answer:{' '}
            <input
              onChange={(e) => setFakeTextInputValue(e.target.value)}
              value={fakeTextInputValue}
            />
          </label>
        </P>
        <P>
          <Caption>{testSentence}</Caption>
        </P>
      </Card>
    </React.Fragment>
  );
}

export function button(props: ButtonProps): JSX.Element {
  return <Button {...props} />;
}
