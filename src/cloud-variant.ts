export type CloudTransform = 'mirror' | 'rotate180';

// Anchors and texture pixels must use the same transform, including lightning.
export function transformCloudAnchor(anchor: readonly [number, number], transform: CloudTransform): [number, number] {
  return [1 - anchor[0], transform === 'rotate180' ? 1 - anchor[1] : anchor[1]];
}
