import React from 'react';
import { render } from '../test/react_testing_library';

import { Prose } from './prose';

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
  test('with defaults', () => {
    render(<Prose>{proseContent}</Prose>, {
      vxTheme: { colorMode: 'legacy', sizeMode: 'legacy' },
    });
  });

  test('with with non-default options', () => {
    render(
      <Prose compact textCenter maxWidth={false}>
        {proseContent}
      </Prose>,
      {
        vxTheme: { colorMode: 'contrastLow', sizeMode: 'm' },
      }
    );
  });

  test('with right-aligned text', () => {
    render(<Prose textRight>{proseContent}</Prose>);
  });

  test('with theme', () => {
    render(
      <Prose
        themeDeprecated={{
          fontSize: '10px',
          color: '#666666',
        }}
      >
        {proseContent}
      </Prose>,
      {
        vxTheme: { colorMode: 'legacy', sizeMode: 'legacy' },
      }
    );
  });
});
