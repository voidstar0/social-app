import {
  FontAwesomeIcon,
  FontAwesomeIconStyle,
} from '@fortawesome/react-native-fontawesome'
import {useIsFocused} from '@react-navigation/native'
import {useAnalytics} from '@segment/analytics-react-native'
import {useQueryClient} from '@tanstack/react-query'
import {RQKEY as FEED_RQKEY} from '#/state/queries/post-feed'
import {useOnMainScroll} from 'lib/hooks/useOnMainScroll'
import {usePalette} from 'lib/hooks/usePalette'
import {useWebMediaQueries} from 'lib/hooks/useWebMediaQueries'
import {FeedDescriptor, FeedParams} from '#/state/queries/post-feed'
import {ComposeIcon2} from 'lib/icons'
import {colors, s} from 'lib/styles'
import React from 'react'
import {FlatList, View, useWindowDimensions} from 'react-native'
import {useStores} from 'state/index'
import {Feed} from '../posts/Feed'
import {TextLink} from '../util/Link'
import {FAB} from '../util/fab/FAB'
import {LoadLatestBtn} from '../util/load-latest/LoadLatestBtn'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useSession} from '#/state/session'

const POLL_FREQ = 30e3 // 30sec

export function FeedPage({
  testID,
  isPageFocused,
  feed,
  feedParams,
  renderEmptyState,
  renderEndOfFeed,
}: {
  testID?: string
  feed: FeedDescriptor
  feedParams?: FeedParams
  isPageFocused: boolean
  renderEmptyState: () => JSX.Element
  renderEndOfFeed?: () => JSX.Element
}) {
  const store = useStores()
  const {isSandbox} = useSession()
  const pal = usePalette('default')
  const {_} = useLingui()
  const {isDesktop} = useWebMediaQueries()
  const queryClient = useQueryClient()
  const [onMainScroll, isScrolledDown, resetMainScroll] = useOnMainScroll()
  const {screen, track} = useAnalytics()
  const headerOffset = useHeaderOffset()
  const scrollElRef = React.useRef<FlatList>(null)
  const isScreenFocused = useIsFocused()
  const [hasNew, setHasNew] = React.useState(false)

  const scrollToTop = React.useCallback(() => {
    scrollElRef.current?.scrollToOffset({offset: -headerOffset})
    resetMainScroll()
  }, [headerOffset, resetMainScroll])

  const onSoftReset = React.useCallback(() => {
    if (isPageFocused) {
      scrollToTop()
      queryClient.invalidateQueries({queryKey: FEED_RQKEY(feed)})
      setHasNew(false)
    }
  }, [isPageFocused, scrollToTop, queryClient, feed, setHasNew])

  // fires when page within screen is activated/deactivated
  React.useEffect(() => {
    if (!isPageFocused || !isScreenFocused) {
      return
    }
    const softResetSub = store.onScreenSoftReset(onSoftReset)
    screen('Feed')
    return () => {
      softResetSub.remove()
    }
  }, [store, onSoftReset, screen, feed, isPageFocused, isScreenFocused])

  const onPressCompose = React.useCallback(() => {
    track('HomeScreen:PressCompose')
    store.shell.openComposer({})
  }, [store, track])

  const onPressLoadLatest = React.useCallback(() => {
    scrollToTop()
    queryClient.invalidateQueries({queryKey: FEED_RQKEY(feed)})
    setHasNew(false)
  }, [scrollToTop, feed, queryClient, setHasNew])

  const ListHeaderComponent = React.useCallback(() => {
    if (isDesktop) {
      return (
        <View
          style={[
            pal.view,
            {
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 18,
              paddingVertical: 12,
            },
          ]}>
          <TextLink
            type="title-lg"
            href="/"
            style={[pal.text, {fontWeight: 'bold'}]}
            text={
              <>
                {isSandbox ? 'SANDBOX' : 'Bluesky'}{' '}
                {hasNew && (
                  <View
                    style={{
                      top: -8,
                      backgroundColor: colors.blue3,
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                    }}
                  />
                )}
              </>
            }
            onPress={() => store.emitScreenSoftReset()}
          />
          <TextLink
            type="title-lg"
            href="/settings/home-feed"
            style={{fontWeight: 'bold'}}
            accessibilityLabel={_(msg`Feed Preferences`)}
            accessibilityHint=""
            text={
              <FontAwesomeIcon
                icon="sliders"
                style={pal.textLight as FontAwesomeIconStyle}
              />
            }
          />
        </View>
      )
    }
    return <></>
  }, [
    isDesktop,
    pal.view,
    pal.text,
    pal.textLight,
    store,
    hasNew,
    _,
    isSandbox,
  ])

  return (
    <View testID={testID} style={s.h100pct}>
      <Feed
        testID={testID ? `${testID}-feed` : undefined}
        feed={feed}
        feedParams={feedParams}
        enabled={isPageFocused}
        pollInterval={POLL_FREQ}
        scrollElRef={scrollElRef}
        onScroll={onMainScroll}
        onHasNew={setHasNew}
        scrollEventThrottle={1}
        renderEmptyState={renderEmptyState}
        renderEndOfFeed={renderEndOfFeed}
        ListHeaderComponent={ListHeaderComponent}
        headerOffset={headerOffset}
      />
      {(isScrolledDown || hasNew) && (
        <LoadLatestBtn
          onPress={onPressLoadLatest}
          label={_(msg`Load new posts`)}
          showIndicator={hasNew}
        />
      )}
      <FAB
        testID="composeFAB"
        onPress={onPressCompose}
        icon={<ComposeIcon2 strokeWidth={1.5} size={29} style={s.white} />}
        accessibilityRole="button"
        accessibilityLabel={_(msg`New post`)}
        accessibilityHint=""
      />
    </View>
  )
}

function useHeaderOffset() {
  const {isDesktop, isTablet} = useWebMediaQueries()
  const {fontScale} = useWindowDimensions()
  if (isDesktop) {
    return 0
  }
  if (isTablet) {
    return 50
  }
  // default text takes 44px, plus 34px of pad
  // scale the 44px by the font scale
  return 34 + 44 * fontScale
}
