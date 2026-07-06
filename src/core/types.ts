// ============================================================================
// Lumenary V1 — Shared Type Definitions
// All types are explicit. No `any`. No placeholders.
// ============================================================================

// ─── Math Primitives ─────────────────────────────────────────────────────────

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// ─── Geometry ────────────────────────────────────────────────────────────────

export interface AABB {
  min: [number, number, number];
  max: [number, number, number];
}

export interface OBB {
  center: [number, number, number];
  halfExtents: [number, number, number];
  rotation: [number, number, number, number]; // quaternion (x, y, z, w)
}

// ─── Camera ──────────────────────────────────────────────────────────────────

export type CameraMode = 'fps' | 'orbit';

export interface CameraConfig {
  moveSpeed: number;
  lookSensitivity: number;
  interpolationFactor: number;
  orbitMinDistance: number;
  orbitMaxDistance: number;
}

// ─── Scene ───────────────────────────────────────────────────────────────────

export interface HotspotDefinition {
  id: string;
  position: [number, number, number];
  label: string;
  type: 'viewpoint' | 'info' | 'transition';
  targetRoomId?: string;
}

export interface AudioSourceDefinition {
  id: string;
  url: string;
  position: [number, number, number];
  maxDistance: number;
  referenceDistance: number;
  loop: boolean;
  gain: number;
}

export interface RoomDefinition {
  id: string;
  name: string;
  bounds: OBB;
  center: [number, number, number];
  hotspots: HotspotDefinition[];
  audioSources: AudioSourceDefinition[];
  adjacentRoomIds: string[];
}

export interface TransitionPath {
  fromRoomId: string;
  toRoomId: string;
  controlPoints: [number, number, number][];
  duration: number;
}

// ─── Asset Loading ───────────────────────────────────────────────────────────

export type ProgressCallback = (loaded: number, total: number) => void;

export interface PLYHeader {
  vertexCount: number;
  headerSize: number;
  format: string;
}

// ─── LOD ─────────────────────────────────────────────────────────────────────

export interface LODLevel {
  maxSplatCount: number;
  label: string;
}
