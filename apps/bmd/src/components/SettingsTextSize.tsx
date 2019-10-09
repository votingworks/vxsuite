import React, { PointerEventHandler } from 'react'
import styled from 'styled-components'
import { SetUserSettings, TextSizeSetting, UserSettings } from '../config/types'
import Button, { SegmentedButton } from './Button'
import { FONT_SIZES } from '../config/globals'

const Container = styled.div`
  display: flex;
  justify-content: center;
  border: 1px solid #808080;
  border-width: 1px 0;
  padding: 1rem 0;
`
const Center = styled.div`
  display: flex;
  justify-content: center;
`
const FontSizeButtons = styled.div`
  button {
    min-width: ${FONT_SIZES[1] * 4}px;
    /* stylelint-disable declaration-no-important */
    &[data-size='0'] {
      font-size: ${FONT_SIZES[0]}px !important;
    }
    &[data-size='1'] {
      font-size: ${FONT_SIZES[1]}px !important;
    }
    &[data-size='2'] {
      font-size: ${FONT_SIZES[2]}px !important;
    }
    /* stylelint-enable */
  }
`

const Label = styled.div`
  display: block;
  margin-bottom: 0.4rem;
`

interface Props {
  userSettings: UserSettings
  setUserSettings: SetUserSettings
}

const SettingsTextSize = ({ userSettings, setUserSettings }: Props) => {
  const adjustFontSize: PointerEventHandler = event => {
    const target = event.currentTarget as HTMLButtonElement
    const textSize = +target.value as TextSizeSetting
    setUserSettings({ textSize })
  }
  return (
    <Container>
      <Center>
        <div>
          <Label>Change Text Size</Label>
          <FontSizeButtons>
            <SegmentedButton data-testid="change-text-size-buttons">
              {FONT_SIZES.slice(0, 3).map((v: number, i: number) => (
                <Button
                  key={v}
                  data-size={i}
                  small
                  onPress={adjustFontSize}
                  value={i}
                  primary={userSettings.textSize === i}
                >
                  A
                </Button>
              ))}
            </SegmentedButton>
          </FontSizeButtons>
        </div>
      </Center>
    </Container>
  )
}

export default SettingsTextSize
