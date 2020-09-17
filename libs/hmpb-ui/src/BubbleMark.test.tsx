import React from 'react'
import { render } from '@testing-library/react'
import { BubbleMark } from './BubbleMark'

test('renders unchecked', () => {
  expect(
    render(
      <BubbleMark>
        <span>Marvin the Martian</span>
      </BubbleMark>
    ).container
  ).toMatchInlineSnapshot(`
    <div>
      <span
        class="sc-AxirZ kMLqEk"
      >
        <span
          class="sc-AxjAm dScZQT"
          data-mark="true"
        />
        <span
          class="sc-AxiKw bcVzkp"
        >
          <span>
            Marvin the Martian
          </span>
        </span>
      </span>
    </div>
  `)
})

test('renders checked', () => {
  expect(
    render(
      <BubbleMark checked>
        <span>Marvin the Martian</span>
      </BubbleMark>
    ).container
  ).toMatchInlineSnapshot(`
    <div>
      <span
        class="sc-AxirZ kMLqEk"
      >
        <span
          class="sc-AxjAm dKKHvY"
          data-mark="true"
        />
        <span
          class="sc-AxiKw bcVzkp"
        >
          <span>
            Marvin the Martian
          </span>
        </span>
      </span>
    </div>
  `)
})
