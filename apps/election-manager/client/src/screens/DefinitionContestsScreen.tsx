import React, { useContext } from 'react'
import { useParams } from 'react-router-dom'
import {
  Election,
  CandidateContest,
  YesNoContest,
  AnyContest,
} from '@votingworks/ballot-encoder'
import styled from 'styled-components'

import readFileAsync from '../lib/readFileAsync'
import {
  ButtonEventFunction,
  InputEventFunction,
  TextareaEventFunction,
} from '../config/types'

import NavigationScreen from '../components/NavigationScreen'
import AppContext from '../contexts/AppContext'
import Button, { SegmentedButton } from '../components/Button'
import {
  Contest,
  CandidateContestChoices,
} from '../components/HandMarkedPaperBallot'
import Prose from '../components/Prose'
import Text from '../components/Text'
import TextInput from '../components/TextInput'
import { TextareaAutosize } from '../components/Textarea'
import BubbleMark from '../components/BubbleMark'
import FileInputButton from '../components/FileInputButton'

const PageHeader = styled.div`
  margin-bottom: 2rem;
`

const Columns = styled.div`
  display: flex;
  flex-direction: row-reverse;
  align-items: flex-start;
  > div:first-child {
    margin-left: 1rem;
  }
  > div:last-child {
    flex: 1;
  }
`

const RenderedContest = styled.div`
  position: sticky;
  top: 0;
`
const Paper = styled.div`
  background: #ffffff;
  width: 312px;
  font-size: 18px;
  > div {
    margin-bottom: 0;
  }
`

const StyledField = styled.div`
  margin-bottom: 0.75rem;
  label {
    display: block;
    font-size: 0.85rem;
  }
`
const TextField = ({
  disabled = false,
  name,
  label = name,
  min,
  onChange,
  optional,
  pattern,
  step,
  type = 'text',
  value,
}: {
  disabled?: boolean
  name: string
  label?: string
  min?: number
  onChange: InputEventFunction | TextareaEventFunction
  optional?: boolean
  pattern?: string
  step?: number
  type?: 'text' | 'textarea' | 'number'
  value: string | number | undefined
}) => (
  <StyledField>
    <label htmlFor={name}>
      <Text as="span" small>
        {label}
      </Text>
      {optional && (
        <Text as="span" small muted>
          {' '}
          (optional)
        </Text>
      )}
    </label>
    {type === 'textarea' ? (
      <TextareaAutosize
        id={name}
        name={name}
        disabled={disabled}
        value={value}
        onChange={onChange as TextareaEventFunction}
      />
    ) : (
      <TextInput
        id={name}
        name={name}
        type={type}
        disabled={disabled}
        value={value}
        onChange={onChange as InputEventFunction}
        min={min}
        pattern={pattern}
        step={step}
      />
    )}
  </StyledField>
)

const ToggleField = ({
  name,
  label = name,
  trueLabel = 'true',
  falseLabel = 'false',
  value,
  optional,
  onChange,
}: {
  name: string
  label?: string
  trueLabel?: string
  falseLabel?: string
  value: boolean
  optional?: boolean
  onChange: ButtonEventFunction
}) => (
  <StyledField>
    <label htmlFor={name}>
      <strong>{label}</strong>
      {optional && <small> (optional)</small>}
    </label>
    <SegmentedButton>
      <Button
        small
        disabled={!!value}
        name={name}
        value="true"
        onPress={onChange}
      >
        {trueLabel}
      </Button>
      <Button
        small
        disabled={!value}
        name={name}
        value="false"
        onPress={onChange}
      >
        {falseLabel}
      </Button>
    </SegmentedButton>
  </StyledField>
)

const DefinitionContestsScreen = () => {
  const { election: e, saveElection } = useContext(AppContext)
  const election = e!
  const { contestId } = useParams<{ contestId: string }>()
  const contestIndex = election.contests.findIndex((c) => c.id === contestId)
  const contest = election.contests[contestIndex]

  const saveContest = (newContest: AnyContest) => {
    const newElection: Election = { ...election }
    newElection.contests[contestIndex] = newContest
    saveElection(newElection)
  }

  const saveTextField: InputEventFunction = (event) => {
    const { name, value: targetValue, type } = event.currentTarget
    let value: string | number = targetValue
    if (type === 'number') {
      value = parseInt(value, 10)
    }
    if (name === 'seats' && value < 1) {
      value = 1
    }
    saveContest({
      ...contest,
      [name]: value,
    })
  }

  const saveToggleField: ButtonEventFunction = (event) => {
    const { name, value } = event.currentTarget
    saveContest({
      ...contest,
      [name]: value === 'true',
    })
  }

  const saveCandidateTextField: InputEventFunction = (event) => {
    const { name, value: targetValue, type } = event.currentTarget
    let value: string | number = targetValue
    if (type === 'number') {
      value = parseInt(value, 10)
    }
    const nameParts = name.split('.')
    const candidateIndex = parseInt(nameParts[0], 10)
    const candidateKey = nameParts[1]
    const candidateContest = contest as CandidateContest
    const { candidates } = candidateContest
    const newCandidtes = [...candidates]
    newCandidtes[candidateIndex] = {
      ...candidates[candidateIndex],
      [candidateKey]: value,
    }
    saveContest({
      ...candidateContest,
      candidates: newCandidtes,
    })
  }

  const appendSvgToDescription: InputEventFunction = async (event) => {
    const { files } = event.currentTarget
    const file = files && files[0]
    if (file && file.type === 'image/svg+xml') {
      const yesNoContest = contest as YesNoContest
      try {
        const fileContent = await readFileAsync(file)
        const description = `${yesNoContest.description}

${fileContent}`
        saveContest({
          ...yesNoContest,
          description,
        })
      } catch (error) {
        console.error('appendSvgToDescription failed', error) // eslint-disable-line no-console
      }
    } else {
      console.error('Only SVG images are supported.') // eslint-disable-line no-console
    }
  }

  if (contestId && contest) {
    return (
      <NavigationScreen>
        <PageHeader>
          <Prose maxWidth={false}>
            <h1>Edit Contest</h1>
            <p>
              Disabled fields are shown for informational purpose and can be
              edited in the JSON Editor if necessary.
            </p>
          </Prose>
        </PageHeader>
        <Columns>
          <RenderedContest>
            <Prose>
              <h3>Sample Render</h3>
            </Prose>
            <Paper>
              <Contest>
                <Prose>
                  <Text small bold>
                    {contest.section}
                  </Text>
                  <h3>{contest.title}</h3>
                  {contest.type === 'candidate' && (
                    <React.Fragment>
                      <p>
                        {contest.seats === 1
                          ? 'Vote for 1'
                          : `Vote for not more than ${contest.seats}`}
                      </p>
                      <CandidateContestChoices
                        contest={contest}
                        parties={election.parties}
                        vote={[]}
                        locales={{ primary: 'en-US' }}
                      />
                    </React.Fragment>
                  )}
                  {contest.type === 'yesno' && (
                    <React.Fragment>
                      <p>
                        Vote <strong>Yes</strong> or <strong>No</strong>
                      </p>
                      <Text
                        small
                        preLine
                        dangerouslySetInnerHTML={{
                          __html: contest.description,
                        }}
                      />
                      {['Yes', 'No'].map((answer) => (
                        <Text key={answer} bold noWrap>
                          <BubbleMark checked={false}>
                            <span>{answer}</span>
                          </BubbleMark>
                        </Text>
                      ))}
                    </React.Fragment>
                  )}
                </Prose>
              </Contest>
            </Paper>
          </RenderedContest>
          <div>
            <Prose>
              <h3>Contest Data</h3>
            </Prose>
            <TextField
              name="type"
              label="Type"
              value={contest.type}
              onChange={saveTextField}
              disabled
            />
            <TextField
              name="id"
              label="Contest ID"
              value={contest.id}
              onChange={saveTextField}
              disabled
            />
            <TextField
              name="districtId"
              label="District ID"
              value={contest.districtId}
              onChange={saveTextField}
              disabled
            />
            <TextField
              name="partyId"
              label="Party ID"
              value={contest.partyId || ''}
              optional
              onChange={saveTextField}
              disabled
            />
            <TextField
              name="section"
              label="Section Name"
              value={contest.section}
              onChange={saveTextField}
            />
            <TextField
              label="Title"
              name="title"
              value={contest.title}
              onChange={saveTextField}
            />
            {contest.type === 'yesno' && (
              <TextField
                label="Short Title"
                name="shortTitle"
                value={contest.shortTitle}
                onChange={saveTextField}
              />
            )}
            {contest.type === 'candidate' ? (
              <React.Fragment>
                <TextField
                  name="seats"
                  label="Seats"
                  value={contest.seats}
                  type="number"
                  min={0}
                  step={1}
                  pattern="\d*"
                  onChange={saveTextField}
                />
                <ToggleField
                  name="allowWriteIns"
                  label="Allow Write-Ins"
                  value={contest.allowWriteIns}
                  onChange={saveToggleField}
                />
                <h2>Candidates</h2>
                <ol>
                  {contest.candidates.map((candidate, index) => (
                    <li key={candidate.id}>
                      <TextField
                        name={`${index}.name`}
                        label="Candidate Name"
                        value={candidate.name}
                        onChange={saveCandidateTextField}
                      />
                      <TextField
                        name={`${index}.id`}
                        label="Candidate ID"
                        value={candidate.id}
                        onChange={saveCandidateTextField}
                        disabled
                      />
                      <TextField
                        name={`${index}.partyId`}
                        label="Party ID"
                        value={candidate.partyId || ''}
                        optional
                        onChange={saveCandidateTextField}
                        disabled
                      />
                    </li>
                  ))}
                </ol>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <TextField
                  label="Description"
                  name="description"
                  type="textarea"
                  value={contest.description}
                  onChange={saveTextField}
                />
                <FileInputButton
                  buttonProps={{
                    small: true,
                  }}
                  accept="image/svg+xml"
                  onChange={appendSvgToDescription}
                >
                  Append SVG Image to Description
                </FileInputButton>
              </React.Fragment>
            )}
          </div>
        </Columns>
      </NavigationScreen>
    )
  }

  return (
    <NavigationScreen>
      <h1>DefinitionContestsScreen</h1>
      <p>
        /definition/contests - Add new - section - title - party - seats -
        allowWriteIns - candidates.length
      </p>
    </NavigationScreen>
  )
}

export default DefinitionContestsScreen
