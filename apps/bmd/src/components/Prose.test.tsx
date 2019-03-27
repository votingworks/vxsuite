import React from 'react'
import { render } from 'react-testing-library'

import Prose from './Prose'

it(`renders Prose`, async () => {
  const { container } = render(
    <Prose>
      <h1>Heading 1</h1>
      <p>
        Lorem ipsum dolor sit amet consectetur adipisicing elit. Dolor omnis
        quam modi magnam neque. Molestias recusandae, officia maiores nam
        pariatur earum qui inventore minus enim adipisci nemo voluptate at
        harum?
      </p>
      <h2>Heading 2</h2>
      <p>
        Lorem ipsum dolor sit amet consectetur adipisicing elit. Dolor omnis
        quam modi magnam neque. Molestias recusandae, officia maiores nam
        pariatur earum qui inventore minus enim adipisci nemo voluptate at
        harum?
      </p>
      <p>
        Lorem ipsum dolor sit amet consectetur adipisicing elit. Dolor omnis
        quam modi magnam neque. Molestias recusandae, officia maiores nam
        pariatur earum qui inventore minus enim adipisci nemo voluptate at
        harum?
      </p>
      <h3>Heading 3</h3>
      <p>
        Lorem ipsum dolor sit amet consectetur adipisicing elit. Dolor omnis
        quam modi magnam neque. Molestias recusandae, officia maiores nam
        pariatur earum qui inventore minus enim adipisci nemo voluptate at
        harum?
      </p>
    </Prose>
  )
  expect(container.firstChild).toMatchSnapshot()
})
