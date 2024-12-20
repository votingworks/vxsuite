import React from 'react';
import { Meta } from '@storybook/react';
import { LoremIpsum } from 'lorem-ipsum';

import { useTheme } from 'styled-components';
import {
  BUTTON_COLORS,
  BUTTON_FILLS,
  BUTTON_VARIANTS,
  Button,
  ButtonProps,
} from './button';
import { H1, H4, P } from './typography';
import { Card } from './card';

const loremIpsum = new LoremIpsum({
  sentencesPerParagraph: { max: 3, min: 3 },
  wordsPerSentence: { max: 8, min: 3 },
});

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

// TODO
// - come up with a way for the touchscreen variants to still work

export function UsageExamples(props: ButtonProps<unknown>): JSX.Element {
  const theme = useTheme();

  return (
    <React.Fragment>
      <H1>Button Variants</H1>
      <P>These variants provide default styling for common use cases.</P>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {BUTTON_VARIANTS.map((variant) => (
          <div
            key={variant}
            style={{
              background: variant.match(/inverse/i)
                ? theme.colors.inverseBackground
                : undefined,
              padding: '1rem',
            }}
          >
            <Button key="variant" {...props} variant={variant}>
              {variant}
            </Button>
          </div>
        ))}
      </div>

      <H1>Disabled</H1>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {BUTTON_VARIANTS.map((variant) => (
          <div
            key={variant}
            style={{
              background: variant.match(/inverse/i)
                ? theme.colors.inverseBackground
                : undefined,
              padding: '1rem',
            }}
          >
            <Button key="variant" disabled {...props} variant={variant}>
              {variant}
            </Button>
          </div>
        ))}
      </div>

      <H1>Button Color/Fill Combinations</H1>
      <P>
        For more fine-grained control in exceptional situations, you can specify
        color and fill. These should be used sparingly in order to keep things
        consistent.
      </P>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {BUTTON_COLORS.map((color) => (
          <div
            key={color}
            style={{
              background: color.match(/inverse/i)
                ? theme.colors.inverseBackground
                : undefined,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, 1fr)',
              gap: '1rem',
              padding: '1rem',
            }}
          >
            {BUTTON_FILLS.map((fill) => (
              <div key={fill}>
                <Button key={fill} {...props} color={color} fill={fill}>
                  {fill} {color}
                </Button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <H1>With Icons</H1>
      <P>
        Button icons should be placed on the left by default. Buttons may have
        an icon on the right if it makes sense in context (e.g. a directional
        next button).
      </P>
      <P>Buttons with icons should always have a text label.</P>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <Button {...props} variant="primary" icon="Add">
          Add thing
        </Button>
        <Button {...props} icon="Edit">
          Edit thing
        </Button>
        <Button {...props} variant="danger" icon="Delete">
          Remove thing
        </Button>
        <Button {...props} variant="secondary" rightIcon="Next">
          Next
        </Button>
        <Button {...props} variant="primary" icon="Done">
          Save
        </Button>
      </div>

      <H1>Usage In Context</H1>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '1rem',
        }}
      >
        <Card
          footerAlign="right"
          footer={
            <React.Fragment>
              <Button {...props}>Cancel</Button>
              <Button {...props} variant="primary" icon="Checkmark">
                Save and exit
              </Button>
            </React.Fragment>
          }
        >
          <H4 as="h2">All done?</H4>
          <P>{testParagraph}</P>
        </Card>

        <Card
          footerAlign="right"
          footer={
            <React.Fragment>
              <Button {...props}>Cancel</Button>
              <Button {...props} variant="danger" icon="Delete">
                Delete everything
              </Button>
            </React.Fragment>
          }
        >
          <H4 as="h2">Are you sure?</H4>
          <P>{testParagraph}</P>
        </Card>
      </div>
    </React.Fragment>
  );
}

export function button(props: ButtonProps): JSX.Element {
  return <Button {...props} />;
}
