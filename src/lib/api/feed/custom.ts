import {
  AppBskyFeedDefs,
  AppBskyFeedGetFeed as GetCustomFeed,
  BskyAgent,
} from '@atproto/api'
import {FeedAPI, FeedAPIResponse} from './types'

export class CustomFeedAPI implements FeedAPI {
  constructor(
    public agent: BskyAgent,
    public params: GetCustomFeed.QueryParams,
  ) {}

  async peekLatest(): Promise<AppBskyFeedDefs.FeedViewPost> {
    const res = await this.agent.app.bsky.feed.getFeed({
      ...this.params,
      limit: 1,
    })
    return res.data.feed[0]
  }

  async fetch({
    cursor,
    limit,
  }: {
    cursor: string | undefined
    limit: number
  }): Promise<FeedAPIResponse> {
    const res = await this.agent.app.bsky.feed.getFeed({
      ...this.params,
      cursor,
      limit,
    })
    if (res.success) {
      // NOTE
      // some custom feeds fail to enforce the pagination limit
      // so we manually truncate here
      // -prf
      if (res.data.feed.length > limit) {
        res.data.feed = res.data.feed.slice(0, limit)
      }
      return {
        cursor: res.data.cursor,
        feed: res.data.feed,
      }
    }
    return {
      feed: [],
    }
  }
}
