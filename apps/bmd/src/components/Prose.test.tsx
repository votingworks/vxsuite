import React from 'react'
import { render } from '@testing-library/react'

import Prose from './Prose'

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
)

it('renders Prose defaults', async () => {
  const { container } = render(<Prose>{proseContent}</Prose>)
  expect(container.firstChild).toMatchSnapshot()
})

it('renders Prose with compact spacing', async () => {
  const { container } = render(<Prose compact>{proseContent} </Prose>)
  expect(container.firstChild).toMatchSnapshot()
})

it('renders Prose with compact spacing', async () => {
  const { container } = render(<Prose textCenter>{proseContent}</Prose>)
  expect(container.firstChild).toMatchSnapshot()
})
