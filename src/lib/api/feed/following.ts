import {AppBskyFeedDefs, BskyAgent} from '@atproto/api'
import {FeedAPI, FeedAPIResponse} from './types'

export class FollowingFeedAPI implements FeedAPI {
  constructor(public agent: BskyAgent) {}

  async peekLatest(): Promise<AppBskyFeedDefs.FeedViewPost> {
    const res = await this.agent.getTimeline({
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
    const res = await this.agent.getTimeline({
      cursor,
      limit,
    })
    if (res.success) {
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
