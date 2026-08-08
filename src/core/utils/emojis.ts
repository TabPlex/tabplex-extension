import emojiData from "@emoji-mart/data"

import { DEFAULT_WORKSPACE_EMOJIS } from "~core/types"
import { normalizeEmoji } from "~core/utils"

type EmojiMartCategory = {
  id: string
  emojis: string[]
}

type EmojiMartEntry = {
  skins?: Array<{ native?: string }>
}

const ALLOWED_EMOJI_CATEGORIES = new Set([
  "objects",
  "smileys-emotion",
  "people-body",
  "symbols",
  "activities",
  "travel-places"
])

const MAX_EMOJI_SUGGESTIONS = 360

const emojiDataset = emojiData as {
  categories?: EmojiMartCategory[]
  emojis?: Record<string, EmojiMartEntry>
}

export const EMOJI_SUGGESTIONS = (() => {
  const results: string[] = []
  const seen = new Set<string>()
  const push = (emoji: string | undefined) => {
    if (!emoji) return
    const normalized = normalizeEmoji(emoji) || emoji
    if (seen.has(normalized)) return
    seen.add(normalized)
    results.push(normalized)
  }
  DEFAULT_WORKSPACE_EMOJIS.forEach(push)
  emojiDataset.categories?.forEach((category) => {
    if (!ALLOWED_EMOJI_CATEGORIES.has(category.id)) return
    category.emojis.forEach((emojiId) => {
      if (results.length >= MAX_EMOJI_SUGGESTIONS) return
      const native = emojiDataset.emojis?.[emojiId]?.skins?.[0]?.native
      push(native)
    })
  })
  return results
})()
