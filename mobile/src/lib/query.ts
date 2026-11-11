import { AppState } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister"
import { focusManager, QueryClient } from "@tanstack/react-query"
import { HttpError } from "@/lib/api"

const DAY = 24 * 60 * 60 * 1000

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: DAY, // must be >= the persister's maxAge, or restored data is dropped straight away
      networkMode: "offlineFirst", // always try the request; on failure the cached (persisted) data stays on screen
      retry: (failures, error) => !(error instanceof HttpError && error.status < 500 && error.status !== 0) && failures < 2,
    },
  },
})

// Cached data is shown instantly (and offline), then refreshed in the background.
export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: "habits.query-cache", throttleTime: 1000 })
export const persistOptions = { persister, maxAge: DAY, buster: "1" }

// Refetch when the app returns to the foreground, like the PWA does when the tab regains focus.
AppState.addEventListener("change", (state) => focusManager.setFocused(state === "active"))
