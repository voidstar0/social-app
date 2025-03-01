import {
  AppBskyEmbedImages,
  AppBskyEmbedExternal,
  AppBskyEmbedRecord,
  AppBskyEmbedRecordWithMedia,
  AppBskyRichtextFacet,
  BskyAgent,
  ComAtprotoLabelDefs,
  ComAtprotoRepoUploadBlob,
  RichText,
} from '@atproto/api'
import {AtUri} from '@atproto/api'
import {RootStoreModel} from 'state/models/root-store'
import {isNetworkError} from 'lib/strings/errors'
import {LinkMeta} from '../link-meta/link-meta'
import {isWeb} from 'platform/detection'
import {ImageModel} from 'state/models/media/image'
import {shortenLinks} from 'lib/strings/rich-text-manip'
import {logger} from '#/logger'

export interface ExternalEmbedDraft {
  uri: string
  isLoading: boolean
  meta?: LinkMeta
  embed?: AppBskyEmbedRecord.Main
  localThumb?: ImageModel
}

export async function resolveName(store: RootStoreModel, didOrHandle: string) {
  if (!didOrHandle) {
    throw new Error('Invalid handle: ""')
  }
  if (didOrHandle.startsWith('did:')) {
    return didOrHandle
  }

  // we run the resolution always to ensure freshness
  const promise = store.agent
    .resolveHandle({
      handle: didOrHandle,
    })
    .then(res => {
      store.handleResolutions.cache.set(didOrHandle, res.data.did)
      return res.data.did
    })

  // but we can return immediately if it's cached
  const cached = store.handleResolutions.cache.get(didOrHandle)
  if (cached) {
    return cached
  }

  return promise
}

export async function uploadBlob(
  agent: BskyAgent,
  blob: string,
  encoding: string,
): Promise<ComAtprotoRepoUploadBlob.Response> {
  if (isWeb) {
    // `blob` should be a data uri
    return agent.uploadBlob(convertDataURIToUint8Array(blob), {
      encoding,
    })
  } else {
    // `blob` should be a path to a file in the local FS
    return agent.uploadBlob(
      blob, // this will be special-cased by the fetch monkeypatch in /src/state/lib/api.ts
      {encoding},
    )
  }
}

interface PostOpts {
  rawText: string
  replyTo?: string
  quote?: {
    uri: string
    cid: string
  }
  extLink?: ExternalEmbedDraft
  images?: ImageModel[]
  labels?: string[]
  knownHandles?: Set<string>
  onStateChange?: (state: string) => void
  langs?: string[]
}

export async function post(store: RootStoreModel, opts: PostOpts) {
  let embed:
    | AppBskyEmbedImages.Main
    | AppBskyEmbedExternal.Main
    | AppBskyEmbedRecord.Main
    | AppBskyEmbedRecordWithMedia.Main
    | undefined
  let reply
  let rt = new RichText(
    {text: opts.rawText.trimEnd()},
    {
      cleanNewlines: true,
    },
  )

  opts.onStateChange?.('Processing...')
  await rt.detectFacets(store.agent)
  rt = shortenLinks(rt)

  // filter out any mention facets that didn't map to a user
  rt.facets = rt.facets?.filter(facet => {
    const mention = facet.features.find(feature =>
      AppBskyRichtextFacet.isMention(feature),
    )
    if (mention && !mention.did) {
      return false
    }
    return true
  })

  // add quote embed if present
  if (opts.quote) {
    embed = {
      $type: 'app.bsky.embed.record',
      record: {
        uri: opts.quote.uri,
        cid: opts.quote.cid,
      },
    } as AppBskyEmbedRecord.Main
  }

  // add image embed if present
  if (opts.images?.length) {
    const images: AppBskyEmbedImages.Image[] = []
    for (const image of opts.images) {
      opts.onStateChange?.(`Uploading image #${images.length + 1}...`)
      await image.compress()
      const path = image.compressed?.path ?? image.path
      const {width, height} = image.compressed || image
      const res = await uploadBlob(store.agent, path, 'image/jpeg')
      images.push({
        image: res.data.blob,
        alt: image.altText ?? '',
        aspectRatio: {width, height},
      })
    }

    if (opts.quote) {
      embed = {
        $type: 'app.bsky.embed.recordWithMedia',
        record: embed,
        media: {
          $type: 'app.bsky.embed.images',
          images,
        },
      } as AppBskyEmbedRecordWithMedia.Main
    } else {
      embed = {
        $type: 'app.bsky.embed.images',
        images,
      } as AppBskyEmbedImages.Main
    }
  }

  // add external embed if present
  if (opts.extLink && !opts.images?.length) {
    if (opts.extLink.embed) {
      embed = opts.extLink.embed
    } else {
      let thumb
      if (opts.extLink.localThumb) {
        opts.onStateChange?.('Uploading link thumbnail...')
        let encoding
        if (opts.extLink.localThumb.mime) {
          encoding = opts.extLink.localThumb.mime
        } else if (opts.extLink.localThumb.path.endsWith('.png')) {
          encoding = 'image/png'
        } else if (
          opts.extLink.localThumb.path.endsWith('.jpeg') ||
          opts.extLink.localThumb.path.endsWith('.jpg')
        ) {
          encoding = 'image/jpeg'
        } else {
          logger.warn('Unexpected image format for thumbnail, skipping', {
            thumbnail: opts.extLink.localThumb.path,
          })
        }
        if (encoding) {
          const thumbUploadRes = await uploadBlob(
            store.agent,
            opts.extLink.localThumb.path,
            encoding,
          )
          thumb = thumbUploadRes.data.blob
        }
      }

      if (opts.quote) {
        embed = {
          $type: 'app.bsky.embed.recordWithMedia',
          record: embed,
          media: {
            $type: 'app.bsky.embed.external',
            external: {
              uri: opts.extLink.uri,
              title: opts.extLink.meta?.title || '',
              description: opts.extLink.meta?.description || '',
              thumb,
            },
          } as AppBskyEmbedExternal.Main,
        } as AppBskyEmbedRecordWithMedia.Main
      } else {
        embed = {
          $type: 'app.bsky.embed.external',
          external: {
            uri: opts.extLink.uri,
            title: opts.extLink.meta?.title || '',
            description: opts.extLink.meta?.description || '',
            thumb,
          },
        } as AppBskyEmbedExternal.Main
      }
    }
  }

  // add replyTo if post is a reply to another post
  if (opts.replyTo) {
    const replyToUrip = new AtUri(opts.replyTo)
    const parentPost = await store.agent.getPost({
      repo: replyToUrip.host,
      rkey: replyToUrip.rkey,
    })
    if (parentPost) {
      const parentRef = {
        uri: parentPost.uri,
        cid: parentPost.cid,
      }
      reply = {
        root: parentPost.value.reply?.root || parentRef,
        parent: parentRef,
      }
    }
  }

  // set labels
  let labels: ComAtprotoLabelDefs.SelfLabels | undefined
  if (opts.labels?.length) {
    labels = {
      $type: 'com.atproto.label.defs#selfLabels',
      values: opts.labels.map(val => ({val})),
    }
  }

  // add top 3 languages from user preferences if langs is provided
  let langs = opts.langs
  if (opts.langs) {
    langs = opts.langs.slice(0, 3)
  }

  try {
    opts.onStateChange?.('Posting...')
    return await store.agent.post({
      text: rt.text,
      facets: rt.facets,
      reply,
      embed,
      langs,
      labels,
    })
  } catch (e: any) {
    console.error(`Failed to create post: ${e.toString()}`)
    if (isNetworkError(e)) {
      throw new Error(
        'Post failed to upload. Please check your Internet connection and try again.',
      )
    } else {
      throw e
    }
  }
}

// helpers
// =

function convertDataURIToUint8Array(uri: string): Uint8Array {
  var raw = window.atob(uri.substring(uri.indexOf(';base64,') + 8))
  var binary = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) {
    binary[i] = raw.charCodeAt(i)
  }
  return binary
}
