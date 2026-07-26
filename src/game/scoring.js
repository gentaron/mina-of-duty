/**
 * Arcade scoring: running score, kill count and the streak multiplier.
 *
 * Rules (NERDCON_CONTRACT.md):
 *   - kill +100, headshot +150, everything × the current multiplier.
 *   - multiplier climbs +1 for every (3 + mult) kills, capped at ×9.
 *   - it decays one step per 10s without a kill.
 *   - it drops to ×1 ONLY on player death (chip damage never resets it — that is
 *     an FPS, not an arcade game). resetMult() is the death hook.
 *
 * This class holds no engine references. It reports changes through the `emit`
 * callback it is constructed with — `emit('score', {score, delta, mult})` /
 * `emit('mult', {mult})` — so index.js can forward them onto ctx.events as the
 * canonical game:score / game:mult without this file knowing about the bus.
 */

import { KILL_SCORE, HEADSHOT_SCORE, MULT_CAP, MULT_DECAY_S } from './waves.js';

export class Scoring {
  constructor(emit) {
    this._emit = typeof emit === 'function' ? emit : () => {};
    this.reset();
  }

  reset() {
    this.score = 0;
    this.mult = 1;
    this.kills = 0;
    this._streak = 0;      // kills banked toward the next multiplier step
    this._sinceKill = 0;   // seconds since the last kill (drives decay)
  }

  /** Announce the current zeroed state — call after reset() at run start. */
  announce() {
    this._emit('score', { score: this.score, delta: 0, mult: this.mult });
    this._emit('mult', { mult: this.mult });
  }

  /** Register one enemy kill. */
  kill(headshot = false) {
    const base = headshot ? HEADSHOT_SCORE : KILL_SCORE;
    const delta = base * this.mult;
    this.score += delta;
    this.kills += 1;
    this._sinceKill = 0;
    this._emit('score', { score: this.score, delta, mult: this.mult });

    // Escalate the streak. Threshold uses the CURRENT multiplier, so ×1→×2 costs
    // 4 kills, ×2→×3 costs 5, and so on, up to the cap.
    this._streak += 1;
    if (this.mult < MULT_CAP && this._streak >= 3 + this.mult) {
      this._streak = 0;
      this.mult += 1;
      this._emit('mult', { mult: this.mult });
    }
  }

  /** Flat points (wave-clear settle bonus). Caller has already applied ×mult. */
  addBonus(points) {
    if (!points) return;
    this.score += points;
    this._emit('score', { score: this.score, delta: points, mult: this.mult });
  }

  /** Player death: streak collapses to ×1. Score is kept. */
  resetMult() {
    this._streak = 0;
    this._sinceKill = 0;
    if (this.mult !== 1) {
      this.mult = 1;
      this._emit('mult', { mult: this.mult });
    }
  }

  /** Time-based decay. Only call while a wave is actually being fought. */
  update(dt) {
    if (this.mult <= 1) return;
    this._sinceKill += dt;
    if (this._sinceKill >= MULT_DECAY_S) {
      this._sinceKill = 0;
      this._streak = 0;
      this.mult -= 1;
      this._emit('mult', { mult: this.mult });
    }
  }
}
