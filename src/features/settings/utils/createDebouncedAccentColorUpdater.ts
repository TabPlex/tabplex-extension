import { normalizeHex } from "~core/utils"

import {
  createDebouncedSaver,
  type DebouncedSaver
} from "./createDebouncedSaver"

type DebouncedAccentColorUpdater = Omit<DebouncedSaver<string>, "enqueue"> & {
  enqueue: (value: string) => string
}

export const createDebouncedAccentColorUpdater = (
  updateSetting: (value: string) => Promise<void>,
  delayMs: number
): DebouncedAccentColorUpdater => {
  const saver = createDebouncedSaver(updateSetting, delayMs)
  const baseSaver: DebouncedAccentColorUpdater = {
    flush: saver.flush,
    cancel: saver.cancel,
    dispose: saver.dispose,
    enqueue(value: string) {
      const normalized = normalizeHex(value).toUpperCase()
      saver.enqueue(normalized)
      return normalized
    }
  }

  return baseSaver
}
