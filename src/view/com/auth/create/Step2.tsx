import React from 'react'
import {StyleSheet, TouchableWithoutFeedback, View} from 'react-native'
import {observer} from 'mobx-react-lite'
import {CreateAccountModel} from 'state/models/ui/create-account'
import {Text} from 'view/com/util/text/Text'
import {DateInput} from 'view/com/util/forms/DateInput'
import {StepHeader} from './StepHeader'
import {s} from 'lib/styles'
import {usePalette} from 'lib/hooks/usePalette'
import {TextInput} from '../util/TextInput'
import {Policies} from './Policies'
import {ErrorMessage} from 'view/com/util/error/ErrorMessage'
import {isWeb} from 'platform/detection'
import {Trans, msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useModalControls} from '#/state/modals'

/** STEP 2: Your account
 * @field Invite code or waitlist
 * @field Email address
 * @field Email address
 * @field Email address
 * @field Password
 * @field Birth date
 * @readonly Terms of service & privacy policy
 */
export const Step2 = observer(function Step2Impl({
  model,
}: {
  model: CreateAccountModel
}) {
  const pal = usePalette('default')
  const {_} = useLingui()
  const {openModal} = useModalControls()

  const onPressWaitlist = React.useCallback(() => {
    openModal({name: 'waitlist'})
  }, [openModal])

  return (
    <View>
      <StepHeader step="2" title={_(msg`Your account`)} />

      {model.isInviteCodeRequired && (
        <View style={s.pb20}>
          <Text type="md-medium" style={[pal.text, s.mb2]}>
            Invite code
          </Text>
          <TextInput
            testID="inviteCodeInput"
            icon="ticket"
            placeholder={_(msg`Required for this provider`)}
            value={model.inviteCode}
            editable
            onChange={model.setInviteCode}
            accessibilityLabel={_(msg`Invite code`)}
            accessibilityHint="Input invite code to proceed"
          />
        </View>
      )}

      {!model.inviteCode && model.isInviteCodeRequired ? (
        <Text style={[s.alignBaseline, pal.text]}>
          Don't have an invite code?{' '}
          <TouchableWithoutFeedback
            onPress={onPressWaitlist}
            accessibilityLabel={_(msg`Join the waitlist.`)}
            accessibilityHint="">
            <View style={styles.touchable}>
              <Text style={pal.link}>
                <Trans>Join the waitlist.</Trans>
              </Text>
            </View>
          </TouchableWithoutFeedback>
        </Text>
      ) : (
        <>
          <View style={s.pb20}>
            <Text type="md-medium" style={[pal.text, s.mb2]} nativeID="email">
              <Trans>Email address</Trans>
            </Text>
            <TextInput
              testID="emailInput"
              icon="envelope"
              placeholder={_(msg`Enter your email address`)}
              value={model.email}
              editable
              onChange={model.setEmail}
              accessibilityLabel={_(msg`Email`)}
              accessibilityHint="Input email for Bluesky waitlist"
              accessibilityLabelledBy="email"
            />
          </View>

          <View style={s.pb20}>
            <Text
              type="md-medium"
              style={[pal.text, s.mb2]}
              nativeID="password">
              <Trans>Password</Trans>
            </Text>
            <TextInput
              testID="passwordInput"
              icon="lock"
              placeholder={_(msg`Choose your password`)}
              value={model.password}
              editable
              secureTextEntry
              onChange={model.setPassword}
              accessibilityLabel={_(msg`Password`)}
              accessibilityHint="Set password"
              accessibilityLabelledBy="password"
            />
          </View>

          <View style={s.pb20}>
            <Text
              type="md-medium"
              style={[pal.text, s.mb2]}
              nativeID="birthDate">
              <Trans>Your birth date</Trans>
            </Text>
            <DateInput
              testID="birthdayInput"
              value={model.birthDate}
              onChange={model.setBirthDate}
              buttonType="default-light"
              buttonStyle={[pal.border, styles.dateInputButton]}
              buttonLabelType="lg"
              accessibilityLabel={_(msg`Birthday`)}
              accessibilityHint="Enter your birth date"
              accessibilityLabelledBy="birthDate"
            />
          </View>

          {model.serviceDescription && (
            <Policies
              serviceDescription={model.serviceDescription}
              needsGuardian={!model.isAge18}
            />
          )}
        </>
      )}
      {model.error ? (
        <ErrorMessage message={model.error} style={styles.error} />
      ) : undefined}
    </View>
  )
})

const styles = StyleSheet.create({
  error: {
    borderRadius: 6,
    marginTop: 10,
  },
  dateInputButton: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 14,
  },
  // @ts-expect-error: Suppressing error due to incomplete `ViewStyle` type definition in react-native-web, missing `cursor` prop as discussed in https://github.com/necolas/react-native-web/issues/832.
  touchable: {
    ...(isWeb && {cursor: 'pointer'}),
  },
})
