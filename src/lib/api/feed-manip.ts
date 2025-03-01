import {
  AppBskyFeedDefs,
  AppBskyFeedPost,
  AppBskyEmbedRecordWithMedia,
  AppBskyEmbedRecord,
} from '@atproto/api'
import {ReasonFeedSource} from './feed/types'
import {isPostInLanguage} from '../../locale/helpers'
type FeedViewPost = AppBskyFeedDefs.FeedViewPost

export type FeedTunerFn = (
  tuner: FeedTuner,
  slices: FeedViewPostsSlice[],
) => FeedViewPostsSlice[]

export class FeedViewPostsSlice {
  isFlattenedReply = false

  constructor(public items: FeedViewPost[] = []) {}

  get _reactKey() {
    return `slice-${this.items[0].post.uri}-${
      this.items[0].reason?.indexedAt || this.items[0].post.indexedAt
    }`
  }

  get uri() {
    if (this.isFlattenedReply) {
      return this.items[1].post.uri
    }
    return this.items[0].post.uri
  }

  get ts() {
    if (this.items[0].reason?.indexedAt) {
      return this.items[0].reason.indexedAt as string
    }
    return this.items[0].post.indexedAt
  }

  get isThread() {
    return (
      this.items.length > 1 &&
      this.items.every(
        item => item.post.author.did === this.items[0].post.author.did,
      )
    )
  }

  get isFullThread() {
    return this.isThread && !this.items[0].reply
  }

  get rootItem() {
    if (this.isFlattenedReply) {
      return this.items[1]
    }
    return this.items[0]
  }

  get isReply() {
    return (
      AppBskyFeedPost.isRecord(this.rootItem.post.record) &&
      !!this.rootItem.post.record.reply
    )
  }

  get source(): ReasonFeedSource | undefined {
    return this.items.find(item => '__source' in item && !!item.__source)
      ?.__source as ReasonFeedSource
  }

  containsUri(uri: string) {
    return !!this.items.find(item => item.post.uri === uri)
  }

  isNextInThread(uri: string) {
    return this.items[this.items.length - 1].post.uri === uri
  }

  insert(item: FeedViewPost) {
    const selfReplyUri = getSelfReplyUri(item)
    const i = this.items.findIndex(item2 => item2.post.uri === selfReplyUri)
    if (i !== -1) {
      this.items.splice(i + 1, 0, item)
    } else {
      this.items.push(item)
    }
  }

  flattenReplyParent() {
    if (this.items[0].reply) {
      const reply = this.items[0].reply
      if (AppBskyFeedDefs.isPostView(reply.parent)) {
        this.isFlattenedReply = true
        this.items.splice(0, 0, {post: reply.parent})
      }
    }
  }

  isFollowingAllAuthors(userDid: string) {
    const item = this.rootItem
    if (item.post.author.did === userDid) {
      return true
    }
    if (AppBskyFeedDefs.isPostView(item.reply?.parent)) {
      const parent = item.reply?.parent
      if (parent?.author.did === userDid) {
        return true
      }
      return (
        parent?.author.viewer?.following && item.post.author.viewer?.following
      )
    }
    return false
  }
}

export class NoopFeedTuner {
  reset() {}
  tune(
    feed: FeedViewPost[],
    _tunerFns: FeedTunerFn[] = [],
    _opts?: {dryRun: boolean; maintainOrder: boolean},
  ): FeedViewPostsSlice[] {
    return feed.map(item => new FeedViewPostsSlice([item]))
  }
}

export class FeedTuner {
  seenUris: Set<string> = new Set()

  constructor() {}

  reset() {
    this.seenUris.clear()
  }

  tune(
    feed: FeedViewPost[],
    tunerFns: FeedTunerFn[] = [],
    {dryRun, maintainOrder}: {dryRun: boolean; maintainOrder: boolean} = {
      dryRun: false,
      maintainOrder: false,
    },
  ): FeedViewPostsSlice[] {
    let slices: FeedViewPostsSlice[] = []

    if (maintainOrder) {
      slices = feed.map(item => new FeedViewPostsSlice([item]))
    } else {
      // arrange the posts into thread slices
      for (let i = feed.length - 1; i >= 0; i--) {
        const item = feed[i]

        const selfReplyUri = getSelfReplyUri(item)
        if (selfReplyUri) {
          const parent = slices.find(item2 =>
            item2.isNextInThread(selfReplyUri),
          )
          if (parent) {
            parent.insert(item)
            continue
          }
        }
        slices.unshift(new FeedViewPostsSlice([item]))
      }
    }

    // run the custom tuners
    for (const tunerFn of tunerFns) {
      slices = tunerFn(this, slices.slice())
    }

    // remove any items already "seen"
    const soonToBeSeenUris: Set<string> = new Set()
    for (let i = slices.length - 1; i >= 0; i--) {
      if (!slices[i].isThread && this.seenUris.has(slices[i].uri)) {
        slices.splice(i, 1)
      } else {
        for (const item of slices[i].items) {
          soonToBeSeenUris.add(item.post.uri)
        }
      }
    }

    // turn non-threads with reply parents into threads
    for (const slice of slices) {
      if (!slice.isThread && !slice.items[0].reason && slice.items[0].reply) {
        const reply = slice.items[0].reply
        if (
          AppBskyFeedDefs.isPostView(reply.parent) &&
          !this.seenUris.has(reply.parent.uri) &&
          !soonToBeSeenUris.has(reply.parent.uri)
        ) {
          const uri = reply.parent.uri
          slice.flattenReplyParent()
          soonToBeSeenUris.add(uri)
        }
      }
    }

    if (!dryRun) {
      for (const slice of slices) {
        for (const item of slice.items) {
          this.seenUris.add(item.post.uri)
        }
      }
    }

    return slices
  }

  static removeReplies(tuner: FeedTuner, slices: FeedViewPostsSlice[]) {
    for (let i = slices.length - 1; i >= 0; i--) {
      if (slices[i].isReply) {
        slices.splice(i, 1)
      }
    }
    return slices
  }

  static removeReposts(tuner: FeedTuner, slices: FeedViewPostsSlice[]) {
    for (let i = slices.length - 1; i >= 0; i--) {
      const reason = slices[i].rootItem.reason
      if (AppBskyFeedDefs.isReasonRepost(reason)) {
        slices.splice(i, 1)
      }
    }
    return slices
  }

  static removeQuotePosts(tuner: FeedTuner, slices: FeedViewPostsSlice[]) {
    for (let i = slices.length - 1; i >= 0; i--) {
      const embed = slices[i].rootItem.post.embed
      if (
        AppBskyEmbedRecord.isView(embed) ||
        AppBskyEmbedRecordWithMedia.isView(embed)
      ) {
        slices.splice(i, 1)
      }
    }
    return slices
  }

  static dedupReposts(
    tuner: FeedTuner,
    slices: FeedViewPostsSlice[],
  ): FeedViewPostsSlice[] {
    // remove duplicates caused by reposts
    for (let i = 0; i < slices.length; i++) {
      const item1 = slices[i]
      for (let j = i + 1; j < slices.length; j++) {
        const item2 = slices[j]
        if (item2.isThread) {
          // dont dedup items that are rendering in a thread as this can cause rendering errors
          continue
        }
        if (item1.containsUri(item2.items[0].post.uri)) {
          slices.splice(j, 1)
          j--
        }
      }
    }
    return slices
  }

  static thresholdRepliesOnly({
    userDid,
    minLikes,
    followedOnly,
  }: {
    userDid: string
    minLikes: number
    followedOnly: boolean
  }) {
    return (
      tuner: FeedTuner,
      slices: FeedViewPostsSlice[],
    ): FeedViewPostsSlice[] => {
      // remove any replies without at least minLikes likes
      for (let i = slices.length - 1; i >= 0; i--) {
        const slice = slices[i]
        if (slice.isFullThread || !slice.isReply) {
          continue
        }

        const item = slice.rootItem
        const isRepost = Boolean(item.reason)
        if (isRepost) {
          continue
        }
        if ((item.post.likeCount || 0) < minLikes) {
          slices.splice(i, 1)
        } else if (followedOnly && !slice.isFollowingAllAuthors(userDid)) {
          slices.splice(i, 1)
        }
      }
      return slices
    }
  }

  /**
   * This function filters a list of FeedViewPostsSlice items based on whether they contain text in a
   * preferred language.
   * @param {string[]} preferredLangsCode2 - An array of preferred language codes in ISO 639-1 or ISO 639-2 format.
   * @returns A function that takes in a `FeedTuner` and an array of `FeedViewPostsSlice` objects and
   * returns an array of `FeedViewPostsSlice` objects.
   */
  static preferredLangOnly(preferredLangsCode2: string[]) {
    return (
      tuner: FeedTuner,
      slices: FeedViewPostsSlice[],
    ): FeedViewPostsSlice[] => {
      // early return if no languages have been specified
      if (!preferredLangsCode2.length || preferredLangsCode2.length === 0) {
        return slices
      }

      for (let i = slices.length - 1; i >= 0; i--) {
        let hasPreferredLang = false
        for (const item of slices[i].items) {
          if (isPostInLanguage(item.post, preferredLangsCode2)) {
            hasPreferredLang = true
            break
          }
        }

        // if item does not fit preferred language, remove it
        if (!hasPreferredLang) {
          slices.splice(i, 1)
        }
      }
      return slices
    }
  }
}

function getSelfReplyUri(item: FeedViewPost): string | undefined {
  if (item.reply) {
    if (
      AppBskyFeedDefs.isPostView(item.reply.parent) &&
      !AppBskyFeedDefs.isReasonRepost(item.reason) // don't thread reposted self-replies
    ) {
      return item.reply.parent.author.did === item.post.author.did
        ? item.reply.parent.uri
        : undefined
    }
  }
  return undefined
}
