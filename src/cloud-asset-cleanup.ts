// Offline asset preparation only. The renderer must never perform this
// readback or pixel loop during playback. A bright point with an otherwise
// uniform neighbourhood is likely a baked-in star; retain connected cloud
// highlights and the dark cloud body independently of their brightness.
export function removeIsolatedStars(width: number, height: number, rgba: Uint8ClampedArray) {
  if (width < 1 || height < 1 || rgba.length !== width * height * 4) {
    throw new RangeError('Invalid cloud image dimensions');
  }
  const result = new Uint8ClampedArray(rgba), candidates = new Uint8Array(width * height);
  const luma = new Float32Array(width * height), stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) {
      const i = y * width + x, p = i * 4;
      const value = .2126 * rgba[p]! + .7152 * rgba[p + 1]! + .0722 * rgba[p + 2]!;
      luma[i] = value; sum += value;
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1]! + sum;
    }
  }
  const box = (left: number, top: number, right: number, bottom: number) =>
    integral[bottom * stride + right]! - integral[top * stride + right]!
      - integral[bottom * stride + left]! + integral[top * stride + left]!;
  // A seven-pixel ring estimates the local cloud body without treating a
  // small 2x2 point-spread halo as background.
  for (let y = 3; y < height - 3; y++) for (let x = 3; x < width - 3; x++) {
    const i = y * width + x, value = luma[i]!;
    const ring = (box(x - 3, y - 3, x + 4, y + 4) - box(x - 1, y - 1, x + 2, y + 2)) / 40;
    if (rgba[i * 4 + 3] && value >= 18 && value - ring >= 8) candidates[i] = 1;
  }
  for (let y = 3; y < height - 3; y++) for (let x = 3; x < width - 3; x++) {
    const start = y * width + x;
    if (candidates[start] !== 1) continue;
    const queue = [start], cluster: number[] = [];
    let minX = x, maxX = x, minY = y, maxY = y;
    candidates[start] = 2;
    for (let n = 0; n < queue.length; n++) {
      const i = queue[n]!, px = i % width, py = Math.floor(i / width);
      cluster.push(i); minX = Math.min(minX, px); maxX = Math.max(maxX, px);
      minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const next = (py + dy) * width + px + dx;
        if (candidates[next] === 1) { candidates[next] = 2; queue.push(next); }
      }
    }
    // Larger or elongated components are structure, not isolated stars.
    if (cluster.length > 12 || maxX - minX > 3 || maxY - minY > 3) continue;
    const sample: number[] = [];
    for (let sy = Math.max(0, minY - 2); sy <= Math.min(height - 1, maxY + 2); sy++) {
      for (let sx = Math.max(0, minX - 2); sx <= Math.min(width - 1, maxX + 2); sx++) {
        if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) continue;
        const i = sy * width + sx;
        if (!candidates[i] && rgba[i * 4 + 3]) sample.push(i * 4);
      }
    }
    if (!sample.length) continue;
    for (let channel = 0; channel < 3; channel++) {
      const value = Math.round(sample.reduce((sum, p) => sum + rgba[p + channel]!, 0) / sample.length);
      for (const i of cluster) result[i * 4 + channel] = value;
    }
  }
  return result;
}
