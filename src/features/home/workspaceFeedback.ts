export type WorkspaceFeedback = {
  kind: "success" | "error" | "info"
  message: string
}

type ToastApi = {
  success: (message: string, options?: { duration?: number }) => void
  error: (message: string, options?: { duration?: number }) => void
  info: (message: string, options?: { duration?: number }) => void
}

export const showWorkspaceFeedbackToast = (
  toastApi: ToastApi,
  feedback: WorkspaceFeedback
) => {
  const options = { duration: 2400 }

  if (feedback.kind === "success") {
    toastApi.success(feedback.message, options)
    return
  }

  if (feedback.kind === "info") {
    toastApi.info(feedback.message, options)
    return
  }

  toastApi.error(feedback.message, options)
}
