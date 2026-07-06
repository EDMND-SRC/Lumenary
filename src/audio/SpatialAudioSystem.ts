import type { RoomDefinition, AudioSourceDefinition } from '../core/types';

interface AudioSourceNode {
  definition: AudioSourceDefinition;
  source: AudioBufferSourceNode;
  panner: PannerNode;
  gain: GainNode;
  isPlaying: boolean;
}

export class SpatialAudioSystem {
  private audioContext: AudioContext | null;
  private masterGain: GainNode;
  private sources: Map<string, AudioSourceNode>;
  private activeRoomId: string | null;
  private isInitialized: boolean;
  private fadeTimers: Map<string, ReturnType<typeof setTimeout>>;

  constructor() {
    this.audioContext = null;
    this.masterGain = null as unknown as GainNode;
    this.sources = new Map();
    this.activeRoomId = null;
    this.isInitialized = false;
    this.fadeTimers = new Map();
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  public async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      this.audioContext = new AudioContext();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.audioContext.destination);
      this.isInitialized = true;
      return true;
    } catch (err) {
      console.warn('[SpatialAudio] Failed to initialize AudioContext:', err);
      return false;
    }
  }

  public suspend(): void {
    if (this.audioContext && this.audioContext.state === 'running') {
      this.audioContext.suspend();
    }
  }

  public resume(): void {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  public destroy(): void {
    for (const [, source] of this.sources) {
      if (source.isPlaying) {
        try { source.source.stop(); } catch { /* already stopped */ }
      }
      source.source.disconnect();
      source.panner.disconnect();
      source.gain.disconnect();
    }
    this.sources.clear();
    this.fadeTimers.clear();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.isInitialized = false;
  }

  // ─── Room Audio ────────────────────────────────────────────────────────

  public async loadRoomAudio(room: RoomDefinition): Promise<void> {
    if (!this.isInitialized || !this.audioContext) return;

    for (const def of room.audioSources) {
      if (this.sources.has(def.id)) continue;

      try {
        const node = await this.createSourceNode(def);
        this.sources.set(def.id, node);
      } catch (err) {
        console.warn(`[SpatialAudio] Failed to load audio source ${def.id} from ${def.url}:`, err);
      }
    }
  }

  public unloadRoomAudio(roomId: string): void {
    for (const [id, source] of this.sources) {
      if (source.definition.id.startsWith(roomId.substring(0, 3))) {
        if (source.isPlaying) {
          try { source.source.stop(); } catch { /* already stopped */ }
        }
        source.source.disconnect();
        source.panner.disconnect();
        source.gain.disconnect();
        this.sources.delete(id);
      }
    }
  }

  public setActiveRoom(roomId: string | null): void {
    if (roomId === this.activeRoomId) return;

    const previousRoomId = this.activeRoomId;
    this.activeRoomId = roomId;

    this.crossfadeRooms(previousRoomId, roomId);
  }

  // ─── Update Loop ────────────────────────────────────────────────────────

  public update(cameraPosition: [number, number, number]): void {
    if (!this.isInitialized) return;

    this.updatePannerPositions(cameraPosition);

    // Start playing sources that should be audible
    for (const [, source] of this.sources) {
      const dist = this.calculateDistance(
        source.definition.position,
        cameraPosition
      );

      if (dist < source.definition.maxDistance && !source.isPlaying) {
        try {
          source.source.start(0);
          source.isPlaying = true;
        } catch { /* already started */ }
      }
    }
  }

  // ─── Playback Control ──────────────────────────────────────────────────

  public setMasterVolume(volume: number): void {
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        Math.max(0, Math.min(1, volume)),
        this.audioContext?.currentTime || 0,
        0.1
      );
    }
  }

  public muteAll(): void {
    this.setMasterVolume(0);
  }

  public unmuteAll(): void {
    this.setMasterVolume(0.5);
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private async fetchAudioBuffer(url: string): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('[SpatialAudio] AudioContext not initialized.');
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`[SpatialAudio] Failed to fetch audio from ${url}: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return this.audioContext.decodeAudioData(arrayBuffer);
  }

  private async createSourceNode(definition: AudioSourceDefinition): Promise<AudioSourceNode> {
    if (!this.audioContext || !this.masterGain) {
      throw new Error('[SpatialAudio] AudioContext not initialized.');
    }

    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await this.fetchAudioBuffer(definition.url);
    } catch (err) {
      throw err;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = definition.loop;

    const panner = this.audioContext.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = definition.referenceDistance;
    panner.maxDistance = definition.maxDistance;
    panner.positionX.value = definition.position[0];
    panner.positionY.value = definition.position[1];
    panner.positionZ.value = definition.position[2];

    const gain = this.audioContext.createGain();
    gain.gain.value = definition.gain;

    source.connect(panner);
    panner.connect(gain);
    gain.connect(this.masterGain);

    return {
      definition,
      source,
      panner,
      gain,
      isPlaying: false,
    };
  }

  private updatePannerPositions(cameraPosition: [number, number, number]): void {
    if (!this.audioContext) return;

    for (const [, source] of this.sources) {
      const dist = this.calculateDistance(
        source.definition.position,
        cameraPosition
      );

      // Proximity-based gain attenuation
      let proximityGain = 1.0;
      if (dist > source.definition.referenceDistance) {
        proximityGain = source.definition.referenceDistance / dist;
      }
      proximityGain = Math.max(0, Math.min(1, proximityGain));

      const targetGain = source.definition.gain * proximityGain;
      source.gain.gain.setTargetAtTime(
        targetGain,
        this.audioContext.currentTime,
        0.05
      );
    }
  }

  private crossfadeRooms(
    fromRoomId: string | null,
    toRoomId: string | null
  ): void {
    if (!this.audioContext) return;

    const FADE_DURATION = 0.5;

    // Fade out sources from previous room
    if (fromRoomId) {
      for (const [id, source] of this.sources) {
        if (this.isSourceInRoom(id, fromRoomId)) {
          const timer = this.fadeTimers.get(id);
          if (timer) clearTimeout(timer);

          source.gain.gain.setTargetAtTime(
            0,
            this.audioContext.currentTime,
            FADE_DURATION / 3
          );

          this.fadeTimers.set(id, setTimeout(() => {
            if (source.isPlaying) {
              try { source.source.stop(); } catch { /* already stopped */ }
              source.isPlaying = false;
            }
          }, FADE_DURATION * 1000));
        }
      }
    }

    // Fade in sources for new room
    if (toRoomId) {
      for (const [id, source] of this.sources) {
        if (this.isSourceInRoom(id, toRoomId)) {
          const timer = this.fadeTimers.get(id);
          if (timer) clearTimeout(timer);

          if (!source.isPlaying) {
            try {
              source.source.start(0);
              source.isPlaying = true;
            } catch { /* already started */ }
          }

          source.gain.gain.setTargetAtTime(
            source.definition.gain,
            this.audioContext.currentTime,
            FADE_DURATION / 3
          );
        }
      }
    }
  }

  private isSourceInRoom(sourceId: string, roomId: string): boolean {
    // Audio source IDs follow the pattern: roomId_prefix
    // We check if the sourceId starts with the first 3 chars of the roomId
    return sourceId.startsWith(roomId.substring(0, 3));
  }

  private calculateDistance(
    sourcePos: [number, number, number],
    cameraPos: [number, number, number]
  ): number {
    const dx = sourcePos[0] - cameraPos[0];
    const dy = sourcePos[1] - cameraPos[1];
    const dz = sourcePos[2] - cameraPos[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}
