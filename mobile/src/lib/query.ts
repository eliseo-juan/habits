import { AppState } from "react-native"
import { focusManager, QueryClient } from "@tanstack/react-query"
import { HttpError } from "@/lib/api"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failures, error) => !(error instanceof HttpError && error.status < 500 && error.status !== 0) && failures < 2,
    },
  },
})

// Refetch when the app returns to the foreground, like the PWA does when the tab regains focus.
AppState.addEventListener("change", (state) => focusManager.setFocused(state === "active"))
