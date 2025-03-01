import React from 'react'
import {StyleSheet, View} from 'react-native'
import {observer} from 'mobx-react-lite'
import {FeedPostSlice} from '#/state/queries/post-feed'
import {AtUri, moderatePost} from '@atproto/api'
import {Link} from '../util/Link'
import {Text} from '../util/text/Text'
import Svg, {Circle, Line} from 'react-native-svg'
import {FeedItem} from './FeedItem'
import {usePalette} from 'lib/hooks/usePalette'
import {makeProfileLink} from 'lib/routes/links'
import {useStores} from '#/state'

export const FeedSlice = observer(function FeedSliceImpl({
  slice,
  dataUpdatedAt,
  ignoreFilterFor,
}: {
  slice: FeedPostSlice
  dataUpdatedAt: number
  ignoreFilterFor?: string
}) {
  const store = useStores()
  const moderations = React.useMemo(() => {
    return slice.items.map(item =>
      moderatePost(item.post, store.preferences.moderationOpts),
    )
  }, [slice, store.preferences.moderationOpts])

  // apply moderation filter
  for (let i = 0; i < slice.items.length; i++) {
    if (
      moderations[i]?.content.filter &&
      slice.items[i].post.author.did !== ignoreFilterFor
    ) {
      return null
    }
  }

  if (slice.isThread && slice.items.length > 3) {
    const last = slice.items.length - 1
    return (
      <>
        <FeedItem
          key={slice.items[0]._reactKey}
          post={slice.items[0].post}
          record={slice.items[0].record}
          reason={slice.items[0].reason}
          moderation={moderations[0]}
          dataUpdatedAt={dataUpdatedAt}
          isThreadParent={isThreadParentAt(slice.items, 0)}
          isThreadChild={isThreadChildAt(slice.items, 0)}
        />
        <FeedItem
          key={slice.items[1]._reactKey}
          post={slice.items[1].post}
          record={slice.items[1].record}
          reason={slice.items[1].reason}
          moderation={moderations[1]}
          dataUpdatedAt={dataUpdatedAt}
          isThreadParent={isThreadParentAt(slice.items, 1)}
          isThreadChild={isThreadChildAt(slice.items, 1)}
        />
        <ViewFullThread slice={slice} />
        <FeedItem
          key={slice.items[last]._reactKey}
          post={slice.items[last].post}
          record={slice.items[last].record}
          reason={slice.items[last].reason}
          moderation={moderations[last]}
          dataUpdatedAt={dataUpdatedAt}
          isThreadParent={isThreadParentAt(slice.items, last)}
          isThreadChild={isThreadChildAt(slice.items, last)}
          isThreadLastChild
        />
      </>
    )
  }

  return (
    <>
      {slice.items.map((item, i) => (
        <FeedItem
          key={item._reactKey}
          post={slice.items[i].post}
          record={slice.items[i].record}
          reason={slice.items[i].reason}
          moderation={moderations[i]}
          dataUpdatedAt={dataUpdatedAt}
          isThreadParent={isThreadParentAt(slice.items, i)}
          isThreadChild={isThreadChildAt(slice.items, i)}
          isThreadLastChild={
            isThreadChildAt(slice.items, i) && slice.items.length === i + 1
          }
        />
      ))}
    </>
  )
})

function ViewFullThread({slice}: {slice: FeedPostSlice}) {
  const pal = usePalette('default')
  const itemHref = React.useMemo(() => {
    const urip = new AtUri(slice.rootUri)
    return makeProfileLink({did: urip.hostname, handle: ''}, 'post', urip.rkey)
  }, [slice.rootUri])

  return (
    <Link
      style={[pal.view, styles.viewFullThread]}
      href={itemHref}
      asAnchor
      noFeedback>
      <View style={styles.viewFullThreadDots}>
        <Svg width="4" height="40">
          <Line
            x1="2"
            y1="0"
            x2="2"
            y2="15"
            stroke={pal.colors.replyLine}
            strokeWidth="2"
          />
          <Circle cx="2" cy="22" r="1.5" fill={pal.colors.replyLineDot} />
          <Circle cx="2" cy="28" r="1.5" fill={pal.colors.replyLineDot} />
          <Circle cx="2" cy="34" r="1.5" fill={pal.colors.replyLineDot} />
        </Svg>
      </View>

      <Text type="md" style={[pal.link, {paddingTop: 18, paddingBottom: 4}]}>
        View full thread
      </Text>
    </Link>
  )
}

const styles = StyleSheet.create({
  viewFullThread: {
    flexDirection: 'row',
    gap: 10,
    paddingLeft: 18,
  },
  viewFullThreadDots: {
    width: 52,
    alignItems: 'center',
  },
})

function isThreadParentAt<T>(arr: Array<T>, i: number) {
  if (arr.length === 1) {
    return false
  }
  return i < arr.length - 1
}

function isThreadChildAt<T>(arr: Array<T>, i: number) {
  if (arr.length === 1) {
    return false
  }
  return i > 0
}
