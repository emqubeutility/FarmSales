import { useEffect, useState, useSyncExternalStore } from 'react';

// Counts the API requests in flight, so the app can show that data is still loading.
let active = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function beginRequest() {
  active += 1;
  emit();
}

export function endRequest() {
  active = Math.max(0, active - 1);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// True while at least one request is still loading. Re-renders when that changes.
export function useFetching(): boolean {
  return useSyncExternalStore(subscribe, () => active > 0, () => false);
}

// For a list page: true until its first data request has finished. Before that the list must say
// "Loading data…", never "No … yet", even on the first paint before the request has started.
export function useLoadingList(): boolean {
  const fetching = useFetching();
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (fetching) setSeen(true);
  }, [fetching]);

  return !seen || fetching;
}
