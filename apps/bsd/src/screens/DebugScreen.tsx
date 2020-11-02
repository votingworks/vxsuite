import React from 'react'
import { Route, Switch } from 'react-router-dom'
import DebugSheet from '../components/DebugSheet'
import DebugSheetList from '../components/DebugSheetList'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Screen from '../components/Screen'

export interface Props {
  isTestMode: boolean
}

const DebugScreen: React.FC<Props> = ({ isTestMode }) => {
  return (
    <Screen>
      <Main>
        <MainChild maxWidth={false}>
          <Switch>
            <Route path="/debug/sheet/:sheetId/:side">
              <DebugSheet />
            </Route>
            <Route path="/debug">
              <DebugSheetList />
            </Route>
          </Switch>
        </MainChild>
      </Main>
      <MainNav isTestMode={isTestMode} />
    </Screen>
  )
}

export default DebugScreen
