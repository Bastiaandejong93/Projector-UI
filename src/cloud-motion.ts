// Lightweight visual cloud interaction, not a fluid simulation. Positions are
// in viewport units; every mass shares the wind direction but has its own speed.
// Bank extents match the widths used by cloud-texture and encode the parallax
// law: speed is inversely tied to bank size. Narrow distant banks ride the
// shared wind faster; the wide chunky foreground masses crawl, so the deck has
// depth without any bank scattering from the prevailing heading.
export const bankWidths = [.62, .54, .66, .50, .58, .27, .44, .37] as const;
export class CloudMotion {
  readonly x = [.15, .58, .30, .82, .45, .23, .68, .36];
  // User feedback 2026-11-04 (latest pass): background cloudfields must move
  // faster than the chunky foreground clouds. Speeds are pinned inverse to the
  // bank widths above — still one cohesive band, so the deck stays coherent.
  readonly speed = [.86, .94, .82, 1.00, .90, 1.24, 1.08, 1.16];
  readonly vaporX = [...this.x];
  readonly vaporSpeed = this.speed.map(speed => speed * 1.18);
  readonly y = [0, 0, 0, 0, 0, 0, 0, 0];
  private previousWind: number | undefined;
  private steering = 0;
  private previousTime: number | undefined;
  private active: Array<boolean | undefined> = new Array(8).fill(undefined);
  // Bank eligibility may rise only when its whole envelope is off screen.
  allow(index: number, desired: number, maxRadius: number) {
    if (this.active[index] === undefined) this.active[index] = desired > 0;
    if (desired <= 0) this.active[index] = false;
    else if (!this.active[index]) {
      // An invisible bank can restart outside the upwind edge. It then travels
      // into view at its own speed; it never appears at its old interior point.
      if (this.x[index]! > -maxRadius && this.x[index]! < 1 + maxRadius) { this.x[index] = -maxRadius - .05; this.vaporX[index] = this.x[index]!; }
      this.active[index] = true;
    }
    return this.active[index] ? desired : 0;
  }
  advance(windX: number, seconds: number, windY = 0) {

    if (this.previousWind === undefined || this.previousTime === undefined || seconds < this.previousTime) {
      this.previousWind = windX; this.previousTime = seconds;
      return;
    }
    // Keep the full wind delta so a frame gap cannot permanently discard
    // displacement; wind fields are already time-limited upstream.
    const dt = Math.max(0, seconds - this.previousTime);
    // A delayed frame or an upstream wind discontinuity cannot teleport a
    // visible bank. Retain the unconsumed wind displacement for later frames.
    const maxStep = .15 * Math.min(dt, .25);
    const dx = Math.max(-maxStep, Math.min(maxStep, windX - this.previousWind));
    this.previousWind += dx; this.previousTime = seconds;
    // Ease even abrupt upstream changes; all banks follow the same bounded path.
    const targetSteering = .045 * Math.sin(windY * 3);
    this.steering += (targetSteering - this.steering) * (1 - Math.exp(-dt / 8));
    // Overlapping clouds keep their own paths and dimensions. A whole cloud
    // is recycled only after its maximum extent has left the viewport.
    for (let i = 0; i < this.x.length; i++) {
      this.x[i] = this.x[i]! + dx * this.speed[i]!;
      this.vaporX[i] = Math.max(this.x[i]! - .08, Math.min(this.x[i]! + .08, this.vaporX[i]! + dx * this.vaporSpeed[i]!));
      // Shared, bounded steering bends the deck gently without splitting it.
      this.y[i] = this.steering;
      if (this.x[i]! > 2.35) { this.x[i] = -1.35; this.vaporX[i] = -1.35; }
      if (this.x[i]! < -1.35) { this.x[i] = 2.35; this.vaporX[i] = 2.35; }

    }
  }
}
