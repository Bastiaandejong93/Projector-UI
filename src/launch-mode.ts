/** The native Home activity always opens Home, including with stale QA URLs. */
export function useDreamMode(requestedMode: string | null, isDreamHost: boolean | undefined): boolean {
  return requestedMode === 'dream' && isDreamHost !== false;
}
