// Each bank keeps moving downwind until it is completely beyond the viewport.
// The next bank is already entering from the opposite edge; asset selection
// therefore happens off-screen, without an in-frame swap or direction change.
export type BankTrack = { offset: number; current: number; incoming: number; previous: number | null };

export function createBankTrack(current: number, incoming: number): BankTrack {
  if (!Number.isInteger(current) || !Number.isInteger(incoming) || current < 0 || incoming < 0 || current === incoming) {
    throw new RangeError('A track needs two distinct bank indices');
  }
  return { offset: 0, current, incoming, previous: null };
}

export function advanceBankTrack(track: BankTrack, distance: number, bankCount: number, random: () => number) {
  if (!Number.isFinite(distance) || distance < 0 || !Number.isInteger(bankCount) || bankCount < 2 ||
      track.current >= bankCount || track.incoming >= bankCount) throw new RangeError('Invalid bank trajectory');
  track.offset += distance;
  while (track.offset >= 1) {
    track.offset -= 1;
    track.previous = track.current;
    track.current = track.incoming;
    const candidates = Array.from({ length: bankCount }, (_, index) => index)
      .filter(index => index !== track.current && (bankCount < 4 || index !== track.previous));
    const roll = Math.max(0, Math.min(.999999999, random()));
    track.incoming = candidates[Math.floor(roll * candidates.length)]!;
  }
}

export function bankPositions(track: BankTrack) {
  return { current: track.offset, incoming: track.offset - 1 };
}
