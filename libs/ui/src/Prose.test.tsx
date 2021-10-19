import React from 'react';
import { render } from '@testing-library/react';

import { Prose } from './Prose';

const proseContent = (
  <React.Fragment>
    <h1>Heading 1</h1>
    <h2>Heading 2</h2>
    <p>
      Lorem ipsum dolor sit amet consectetur adipisicing elit. Dolor omnis quam
      modi magnam neque. Molestias recusandae, officia maiores nam pariatur
      earum qui inventore minus enim adipisci nemo voluptate at harum?
    </p>
    <h1>Heading 1</h1>
    <p>
      Lorem ipsum dolor sit amet consectetur adipisicing elit. Dolor omnis quam
      modi magnam neque. Molestias recusandae, officia maiores nam pariatur
      earum qui inventore minus enim adipisci nemo voluptate at harum?
    </p>
    <h2>Heading 2</h2>
    <p>
      Lorem ipsum dolor sit amet consectetur adipisicing elit. Dolor omnis quam
      modi magnam neque. Molestias recusandae, officia maiores nam pariatur
      earum qui inventore minus enim adipisci nemo voluptate at harum?
    </p>
    <p>
      Lorem ipsum dolor sit amet consectetur adipisicing elit. Dolor omnis quam
      modi magnam neque. Molestias recusandae, officia maiores nam pariatur
      earum qui inventore minus enim adipisci nemo voluptate at harum?
    </p>
    <h3>Heading 3</h3>
    <p>
      Lorem ipsum dolor sit amet consectetur adipisicing elit. Dolor omnis quam
      modi magnam neque. Molestias recusandae, officia maiores nam pariatur
      earum qui inventore minus enim adipisci nemo voluptate at harum?
    </p>
  </React.Fragment>
);
describe('renders Prose', () => {
  test('with defaults', async () => {
    const { container } = render(<Prose>{proseContent}</Prose>);
    expect(container.firstChild).toMatchSnapshot();
  });

  test('with with non-default options', async () => {
    const { container } = render(
      <Prose compact textCenter maxWidth={false}>
        {proseContent}
      </Prose>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  test('with right-aligned text', async () => {
    const { container } = render(<Prose textRight>{proseContent}</Prose>);
    expect(container.firstChild).toMatchSnapshot();
  });

  test('with theme', async () => {
    const { container } = render(
      <Prose
        theme={{
          fontSize: '10px',
          color: '#666666',
        }}
      >
        {proseContent}
      </Prose>
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
