import { Meta } from '@storybook/react';
import React from 'react';
import { H1, H2, H3, P } from '../typography';

export function Spacing(): JSX.Element {
  return (
    <div>
      <H1>Spacing</H1>
      <P>
        We use spacing defined in proportion to font size using <code>rem</code>{' '}
        units. That way spacing scales with font size when users change the font
        size.
      </P>
      <P>
        <strong>
          Spacing should be defined in eighth, quarter, half, or whole rem
          increments.
        </strong>{' '}
        This helps create visual consistency throughout the layout.
      </P>
      <H2>Recommended spacing units</H2>
      <H3>Small</H3>
      <P>
        Small spacing should generally use quarter <code> rem</code> increments.
        The exception is the <code>0.125rem</code> space - the smallest
        recommended space. <code>1rem</code> is a good default spacing to use.
      </P>
      <div
        style={{
          display: 'grid',
          gap: '1.5rem',
          gridTemplateColumns: '4rem auto',
        }}
      >
        {['0.125rem', '0.25rem', '0.5rem', '0.75rem', '1rem'].map((spacing) => (
          <React.Fragment key={spacing}>
            <code>{spacing}</code>
            <div
              style={{ background: 'black', width: spacing, height: '1rem' }}
            />
          </React.Fragment>
        ))}
      </div>
      <br />
      <H3>Medium</H3>
      <P>
        For medium spacing, use half or whole <code>rem</code> increments.
        Smaller increments will be harder to tell apart at larger scales.
      </P>
      <div
        style={{
          display: 'grid',
          gap: '1.5rem',
          gridTemplateColumns: '4rem auto',
        }}
      >
        {['1.5rem', '2rem', '2.5rem', '3rem'].map((spacing) => (
          <React.Fragment key={spacing}>
            <code>{spacing}</code>
            <div
              style={{ background: 'black', width: spacing, height: '1rem' }}
            />
          </React.Fragment>
        ))}
      </div>
      <br />
      <H3>Large</H3>
      <P>
        For large spacing, use whole <code>rem</code> or even <code>2rem</code>{' '}
        increments.
      </P>
      <div
        style={{
          display: 'grid',
          gap: '1.5rem',
          gridTemplateColumns: '4rem auto',
        }}
      >
        {['4rem', '5rem', '6rem', '8rem', '10rem'].map((spacing) => (
          <React.Fragment key={spacing}>
            <code>{spacing}</code>
            <div
              style={{ background: 'black', width: spacing, height: '1rem' }}
            />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

const meta: Meta<typeof Spacing> = {
  title: 'Spacing',
};

export default meta;
