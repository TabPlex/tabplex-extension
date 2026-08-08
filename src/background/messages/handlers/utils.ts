export const runAsyncMessage = <T>(
  type: string,
  sendResponse: (response?: unknown) => void,
  task: () => Promise<T> | T,
  options?: {
    onSuccess?: (value: T) => unknown
    fallbackError?: string
  }
) => {
  let result: Promise<T> | T
  try {
    result = task()
  } catch (err) {
    console.warn(`[TabPlex] message:${type} failed`, err)
    sendResponse({
      ok: false,
      error: options?.fallbackError ?? `${type} failed`
    })
    return true
  }

  void Promise.resolve(result)
    .then((value) => {
      if (options?.onSuccess) {
        sendResponse(options.onSuccess(value))
        return
      }
      sendResponse(value)
    })
    .catch((err) => {
      console.warn(`[TabPlex] message:${type} failed`, err)
      sendResponse({
        ok: false,
        error: options?.fallbackError ?? `${type} failed`
      })
    })

  return true
}
