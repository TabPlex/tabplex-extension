import React from "react"
import { Toaster } from "sonner"

export const AppToaster = () => (
  <Toaster
    position="top-center"
    toastOptions={{
      unstyled: true,
      classNames: {
        toast: "home-toast",
        content: "home-toast-content",
        title: "home-toast-title",
        icon: "home-toast-icon",
        success: "home-toast-success",
        error: "home-toast-error"
      }
    }}
  />
)
