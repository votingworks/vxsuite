import * as workflow from './BallotScreenWorkflow'
import { ReviewBallot, Contest } from '../config/types'

test('starts with init', () => {
  expect(workflow.init()).toEqual({ type: 'init' })
})

test('can mark an option', () => {
  const response: ReviewBallot = {
    ballot: {
      image: { url: '/ballot.jpg', width: 850, height: 1100 },
      url: '/ballot',
    },
    contests: [
      {
        id: 'president',
        title: 'President of the United States',
        bounds: { x: 0, y: 0, width: 200, height: 500 },
        options: [
          {
            type: 'candidate',
            id: 'george-washington',
            name: 'George Washington',
            bounds: { x: 0, y: 150, width: 200, height: 100 },
          },
          {
            type: 'candidate',
            id: 'thomas-jefferson',
            name: 'Thomas Jefferson',
            bounds: { x: 0, y: 250, width: 200, height: 100 },
          },
        ],
      },
    ],
    marks: {},
  }

  let state: workflow.State = workflow.fetchedBallotInfo(
    workflow.init(),
    response
  )

  const president = response.contests[0]
  const georgeWashington = president.options[0]
  state = workflow.change(state, president, georgeWashington, true)

  expect(state).toEqual(
    expect.objectContaining({
      type: 'review',
      changes: { president: { 'george-washington': true } },
    })
  )
})

test('can unmark an option', () => {
  const response: ReviewBallot = {
    ballot: {
      image: { url: '/ballot.jpg', width: 850, height: 1100 },
      url: '/ballot',
    },
    contests: [
      {
        id: 'president',
        title: 'President of the United States',
        bounds: { x: 0, y: 0, width: 200, height: 500 },
        options: [
          {
            type: 'candidate',
            id: 'george-washington',
            name: 'George Washington',
            bounds: { x: 0, y: 150, width: 200, height: 100 },
          },
          {
            type: 'candidate',
            id: 'thomas-jefferson',
            name: 'Thomas Jefferson',
            bounds: { x: 0, y: 250, width: 200, height: 100 },
          },
        ],
      },
    ],
    marks: { president: { 'george-washington': true } },
  }

  let state: workflow.State = workflow.fetchedBallotInfo(
    workflow.init(),
    response
  )

  const president = response.contests[0]
  const georgeWashington = president.options[0]
  state = workflow.change(state, president, georgeWashington, false)

  expect(state).toEqual(
    expect.objectContaining({
      type: 'review',
      changes: { president: { 'george-washington': false } },
    })
  )
})

test('changes can only happen while in review', () => {
  const contest: Contest = {
    id: 'president',
    title: 'President of the United States',
    bounds: { x: 0, y: 0, width: 200, height: 500 },
    options: [
      {
        type: 'candidate',
        id: 'george-washington',
        name: 'George Washington',
        bounds: { x: 0, y: 150, width: 200, height: 100 },
      },
      {
        type: 'candidate',
        id: 'thomas-jefferson',
        name: 'Thomas Jefferson',
        bounds: { x: 0, y: 250, width: 200, height: 100 },
      },
    ],
  }
  const option = contest.options[0]
  expect(() =>
    workflow.change(workflow.init(), contest, option, true)
  ).toThrowError()
})

test('can toggle an option off and back on', () => {
  const response: ReviewBallot = {
    ballot: {
      image: { url: '/ballot.jpg', width: 850, height: 1100 },
      url: '/ballot',
    },
    contests: [
      {
        id: 'president',
        title: 'President of the United States',
        bounds: { x: 0, y: 0, width: 200, height: 500 },
        options: [
          {
            type: 'candidate',
            id: 'george-washington',
            name: 'George Washington',
            bounds: { x: 0, y: 150, width: 200, height: 100 },
          },
          {
            type: 'candidate',
            id: 'thomas-jefferson',
            name: 'Thomas Jefferson',
            bounds: { x: 0, y: 250, width: 200, height: 100 },
          },
        ],
      },
    ],
    marks: { president: { 'george-washington': true } },
  }

  let state: workflow.State = workflow.fetchedBallotInfo(
    workflow.init(),
    response
  )

  const president = response.contests[0]
  const georgeWashington = president.options[0]
  state = workflow.toggle(state, president, georgeWashington)

  expect(state).toEqual(
    expect.objectContaining({
      type: 'review',
      changes: { president: { 'george-washington': false } },
    })
  )

  state = workflow.toggle(state, president, georgeWashington)

  expect(state).toEqual(
    expect.objectContaining({
      type: 'review',
      changes: {},
    })
  )
})

test('toggle can only happen while in review', () => {
  const contest: Contest = {
    id: 'president',
    title: 'President of the United States',
    bounds: { x: 0, y: 0, width: 200, height: 500 },
    options: [
      {
        type: 'candidate',
        id: 'george-washington',
        name: 'George Washington',
        bounds: { x: 0, y: 150, width: 200, height: 100 },
      },
      {
        type: 'candidate',
        id: 'thomas-jefferson',
        name: 'Thomas Jefferson',
        bounds: { x: 0, y: 250, width: 200, height: 100 },
      },
    ],
  }
  const option = contest.options[0]
  expect(() => workflow.toggle(workflow.init(), contest, option)).toThrowError()
})

test('finalize moves out of review preserving the adjudication changes', () => {
  const response: ReviewBallot = {
    ballot: {
      image: { url: '/ballot.jpg', width: 850, height: 1100 },
      url: '/ballot',
    },
    contests: [
      {
        id: 'president',
        title: 'President of the United States',
        bounds: { x: 0, y: 0, width: 200, height: 500 },
        options: [
          {
            type: 'candidate',
            id: 'george-washington',
            name: 'George Washington',
            bounds: { x: 0, y: 150, width: 200, height: 100 },
          },
          {
            type: 'candidate',
            id: 'thomas-jefferson',
            name: 'Thomas Jefferson',
            bounds: { x: 0, y: 250, width: 200, height: 100 },
          },
        ],
      },
    ],
    marks: { president: { 'george-washington': true } },
  }

  let state: workflow.State = workflow.fetchedBallotInfo(
    workflow.init(),
    response
  )

  const president = response.contests[0]
  const georgeWashington = president.options[0]
  state = workflow.toggle(state, president, georgeWashington)
  state = workflow.finalize(state)

  expect(state).toEqual(
    expect.objectContaining({
      type: 'review',
      changes: { president: { 'george-washington': false } },
    })
  )
})

test('finalize can only happen while in review', () => {
  expect(() => workflow.finalize(workflow.init())).toThrowError()
})

test('fail captures error states', () => {
  expect(workflow.fail(workflow.init(), 'fetch did not work')).toEqual({
    type: 'failed',
    previousState: { type: 'init' },
    error: new Error('fetch did not work'),
  })

  expect(
    workflow.fail(workflow.init(), new Error('fetch did not work'))
  ).toEqual({
    type: 'failed',
    previousState: { type: 'init' },
    error: new Error('fetch did not work'),
  })
})
