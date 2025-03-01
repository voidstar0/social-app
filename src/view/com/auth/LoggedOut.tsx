import React from 'react'
import {SafeAreaView} from 'react-native'
import {observer} from 'mobx-react-lite'
import {Login} from 'view/com/auth/login/Login'
import {CreateAccount} from 'view/com/auth/create/CreateAccount'
import {ErrorBoundary} from 'view/com/util/ErrorBoundary'
import {s} from 'lib/styles'
import {usePalette} from 'lib/hooks/usePalette'
import {useAnalytics} from 'lib/analytics/analytics'
import {SplashScreen} from './SplashScreen'
import {useSetMinimalShellMode} from '#/state/shell/minimal-mode'

enum ScreenState {
  S_LoginOrCreateAccount,
  S_Login,
  S_CreateAccount,
}

export const LoggedOut = observer(function LoggedOutImpl() {
  const pal = usePalette('default')
  const setMinimalShellMode = useSetMinimalShellMode()
  const {screen} = useAnalytics()
  const [screenState, setScreenState] = React.useState<ScreenState>(
    ScreenState.S_LoginOrCreateAccount,
  )

  React.useEffect(() => {
    screen('Login')
    setMinimalShellMode(true)
  }, [screen, setMinimalShellMode])

  if (screenState === ScreenState.S_LoginOrCreateAccount) {
    return (
      <SplashScreen
        onPressSignin={() => setScreenState(ScreenState.S_Login)}
        onPressCreateAccount={() => setScreenState(ScreenState.S_CreateAccount)}
      />
    )
  }

  return (
    <SafeAreaView testID="noSessionView" style={[s.hContentRegion, pal.view]}>
      <ErrorBoundary>
        {screenState === ScreenState.S_Login ? (
          <Login
            onPressBack={() =>
              setScreenState(ScreenState.S_LoginOrCreateAccount)
            }
          />
        ) : undefined}
        {screenState === ScreenState.S_CreateAccount ? (
          <CreateAccount
            onPressBack={() =>
              setScreenState(ScreenState.S_LoginOrCreateAccount)
            }
          />
        ) : undefined}
      </ErrorBoundary>
    </SafeAreaView>
  )
})
