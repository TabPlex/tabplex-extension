export const runAsyncMessage = <T>(
  type: string,
  sendResponse: (response?: unknown) => void,
  task: () => Promise<T> | T,
  options?: {
    onSuccess?: (value: T) => unknown
    fallbackError?: string
    publicErrors?: readonly string[]
  }
) => {
  const sendFailure = (err: unknown) => {
    console.warn(`[TabPlex] message:${type} failed`, err)
    const knownError =
      err instanceof Error && options?.publicErrors?.includes(err.message)
        ? err.message
        : undefined
    sendResponse({
      ok: false,
      error: knownError ?? options?.fallbackError ?? `${type} failed`
    })
  }
  let result: Promise<T> | T
  try {
    result = task()
  } catch (err) {
    sendFailure(err)
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
    .catch(sendFailure)

  return true
}
