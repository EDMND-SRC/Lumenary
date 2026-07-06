import type { AssetManager } from '../core/AssetManager';
import type { LumenaryWebGPUContext } from '../core/LumenaryWebGPUContext';
import type { ProgressCallback } from '../core/types';

export interface ProgressiveLoadState {
  phase: 'idle' | 'header' | 'preview' | 'streaming' | 'complete';
  totalSplats: number;
  loadedSplats: number;
  previewSplats: number;
  progress: number;
}

export class ProgressiveLoader {
  private assetManager: AssetManager;
  private engine: LumenaryWebGPUContext;
  private state: ProgressiveLoadState;
  private previewFraction: number;
  private chunkSize: number;

  constructor(
    assetManager: AssetManager,
    engine: LumenaryWebGPUContext,
    previewFraction: number = 0.1,
    chunkSize: number = 100_000
  ) {
    this.assetManager = assetManager;
    this.engine = engine;
    this.previewFraction = previewFraction;
    this.chunkSize = chunkSize;
    this.state = {
      phase: 'idle',
      totalSplats: 0,
      loadedSplats: 0,
      previewSplats: 0,
      progress: 0,
    };
  }

  // ─── Loading ──────────────────────────────────────────────────────────

  public async load(
    url: string,
    onStateChange: (state: ProgressiveLoadState) => void
  ): Promise<{
    totalSplats: number;
    packedData: Float32Array;
  }> {
    this.state = {
      phase: 'header',
      totalSplats: 0,
      loadedSplats: 0,
      previewSplats: 0,
      progress: 0,
    };
    onStateChange({ ...this.state });

    // Phase 1: Stream header + full data
    const { header, packedSplatData } = await this.assetManager.streamPLY(
      url,
      (_loaded: number, _total: number) => {
        // Progress callback for header download
      }
    );

    this.state.totalSplats = header.vertexCount;
    this.state.phase = 'preview';
    onStateChange({ ...this.state });

    // Phase 2: Upload preview splats
    const previewSplatCount = Math.min(
      Math.floor(header.vertexCount * this.previewFraction),
      header.vertexCount
    );
    const previewData = packedSplatData.subarray(0, previewSplatCount * 16);
    this.engine.uploadSplatDataChunk(previewData, 0);
    this.engine.setActualSplatCount(previewSplatCount);

    this.state.loadedSplats = previewSplatCount;
    this.state.previewSplats = previewSplatCount;
    this.state.progress = previewSplatCount / header.vertexCount;
    this.state.phase = 'streaming';
    onStateChange({ ...this.state });

    // Phase 3: Stream remaining chunks
    const remainingSplats = header.vertexCount - previewSplatCount;
    const totalChunks = Math.ceil(remainingSplats / this.chunkSize);

    for (let ci = 0; ci < totalChunks; ci++) {
      const chunkStart = previewSplatCount + ci * this.chunkSize;
      const chunkEnd = Math.min(chunkStart + this.chunkSize, header.vertexCount);
      const chunkCount = chunkEnd - chunkStart;

      const chunkData = packedSplatData.subarray(
        chunkStart * 16,
        chunkEnd * 16
      );

      this.engine.uploadSplatDataChunk(chunkData, chunkStart);
      this.engine.setActualSplatCount(chunkEnd);

      this.state.loadedSplats = chunkEnd;
      this.state.progress = chunkEnd / header.vertexCount;
      onStateChange({ ...this.state });
    }

    // Phase 4: Complete
    this.state.phase = 'complete';
    this.state.loadedSplats = header.vertexCount;
    this.state.progress = 1.0;
    this.engine.setActualSplatCount(header.vertexCount);
    onStateChange({ ...this.state });

    return {
      totalSplats: header.vertexCount,
      packedData: packedSplatData,
    };
  }

  // ─── State ────────────────────────────────────────────────────────────

  public getState(): Readonly<ProgressiveLoadState> {
    return this.state;
  }

  public isComplete(): boolean {
    return this.state.phase === 'complete';
  }
}
