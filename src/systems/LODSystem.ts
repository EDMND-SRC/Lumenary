import type { LODLevel } from '../core/types';

const DEFAULT_LEVELS: LODLevel[] = [
  { maxSplatCount: 200_000, label: 'Ultra Low' },
  { maxSplatCount: 500_000, label: 'Low' },
  { maxSplatCount: 1_000_000, label: 'Medium' },
  { maxSplatCount: 1_500_000, label: 'High' },
  { maxSplatCount: 2_000_000, label: 'Ultra' },
];

export class LODSystem {
  private frameTimes: number[];
  private frameTimeIndex: number;
  private sampleCount: number;
  private currentFPS: number;
  private currentLevelIndex: number;
  private levels: LODLevel[];
  private enabled: boolean;
  private adjustCooldown: number;
  private lastAdjustTime: number;

  constructor(
    levels?: LODLevel[],
    sampleCount: number = 60
  ) {
    this.levels = levels || DEFAULT_LEVELS;
    this.sampleCount = sampleCount;
    this.frameTimes = new Array(sampleCount).fill(1 / 60);
    this.frameTimeIndex = 0;
    this.currentFPS = 60;
    this.currentLevelIndex = this.levels.length - 1;
    this.enabled = true;
    this.adjustCooldown = 1.0;
    this.lastAdjustTime = 0;
  }

  // ─── Per-Frame Update ──────────────────────────────────────────────────

  public update(deltaTime: number): {
    splatCount: number;
    levelIndex: number;
    fps: number;
  } {
    this.currentFPS = this.measureFPS(deltaTime);

    if (this.enabled) {
      this.lastAdjustTime += deltaTime;
      if (this.lastAdjustTime >= this.adjustCooldown) {
        this.currentLevelIndex = this.adjustLevel(this.currentFPS);
        this.lastAdjustTime = 0;
      }
    }

    return {
      splatCount: this.levels[this.currentLevelIndex].maxSplatCount,
      levelIndex: this.currentLevelIndex,
      fps: this.currentFPS,
    };
  }

  // ─── Query ──────────────────────────────────────────────────────────────

  public getCurrentFPS(): number {
    return this.currentFPS;
  }

  public getCurrentLevel(): LODLevel {
    return this.levels[this.currentLevelIndex];
  }

  public getSplatCount(): number {
    return this.levels[this.currentLevelIndex].maxSplatCount;
  }

  // ─── Control ────────────────────────────────────────────────────────────

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public setManualLevel(levelIndex: number): void {
    if (levelIndex >= 0 && levelIndex < this.levels.length) {
      this.currentLevelIndex = levelIndex;
    }
  }

  public getLevels(): ReadonlyArray<LODLevel> {
    return this.levels;
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private measureFPS(deltaTime: number): number {
    this.frameTimes[this.frameTimeIndex] = deltaTime;
    this.frameTimeIndex = (this.frameTimeIndex + 1) % this.sampleCount;

    let sum = 0;
    for (let i = 0; i < this.sampleCount; i++) {
      sum += this.frameTimes[i];
    }
    const avgFrameTime = sum / this.sampleCount;
    return avgFrameTime > 0 ? 1 / avgFrameTime : 60;
  }

  private adjustLevel(fps: number): number {
    let newLevel = this.currentLevelIndex;

    // Decrease quality if FPS is too low
    if (fps < 30 && this.currentLevelIndex > 0) {
      newLevel = this.currentLevelIndex - 1;
    }
    // Increase quality if FPS is high enough
    else if (fps > 50 && this.currentLevelIndex < this.levels.length - 1) {
      newLevel = this.currentLevelIndex + 1;
    }

    return newLevel;
  }
}
