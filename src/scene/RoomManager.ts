import type { RoomDefinition, TransitionPath, HotspotDefinition } from '../core/types';
import type { LumenaryCamera } from '../core/LumenaryCamera';
import type { CollisionSystem } from '../core/CollisionSystem';

export class RoomManager {
  private rooms: Map<string, RoomDefinition>;
  private transitions: Map<string, TransitionPath>;
  private activeRoomId: string | null;
  private previousRoomId: string | null;

  constructor() {
    this.rooms = new Map();
    this.transitions = new Map();
    this.activeRoomId = null;
    this.previousRoomId = null;
  }

  // ─── Setup ────────────────────────────────────────────────────────────────

  public loadProperty(
    rooms: RoomDefinition[],
    transitions: TransitionPath[]
  ): void {
    this.rooms.clear();
    this.transitions.clear();

    for (const room of rooms) {
      this.rooms.set(room.id, room);
    }

    for (const transition of transitions) {
      const key = `${transition.fromRoomId}->${transition.toRoomId}`;
      this.transitions.set(key, transition);
    }
  }

  // ─── Query ────────────────────────────────────────────────────────────────

  public getRoom(id: string): RoomDefinition | undefined {
    return this.rooms.get(id);
  }

  public getActiveRoom(): RoomDefinition | null {
    if (!this.activeRoomId) return null;
    return this.rooms.get(this.activeRoomId) || null;
  }

  public getAdjacentRooms(roomId: string): RoomDefinition[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return room.adjacentRoomIds
      .map(id => this.rooms.get(id))
      .filter((r): r is RoomDefinition => r !== undefined);
  }

  public getHotspotsInRoom(roomId: string): HotspotDefinition[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return room.hotspots;
  }

  public getTransition(fromId: string, toId: string): TransitionPath | undefined {
    return this.transitions.get(`${fromId}->${toId}`);
  }

  // ─── Navigation ──────────────────────────────────────────────────────────

  public updateActiveRoom(
    cameraPosition: [number, number, number],
    collisionSystem: CollisionSystem
  ): string | null {
    const room = collisionSystem.getRoomAtPosition(cameraPosition);
    if (!room) return null;

    if (room.id !== this.activeRoomId) {
      this.previousRoomId = this.activeRoomId;
      this.activeRoomId = room.id;
      return room.id;
    }

    return null;
  }

  public startTransition(
    fromRoomId: string,
    toRoomId: string,
    camera: LumenaryCamera
  ): boolean {
    const transition = this.getTransition(fromRoomId, toRoomId);
    if (!transition) return false;

    const fromPos = camera.getPosition();
    const targetPos = camera.getTarget();
    const toRoom = this.rooms.get(toRoomId);
    if (!toRoom) return false;

    camera.startTransition(
      [fromPos[0], fromPos[1], fromPos[2]],
      transition.controlPoints[transition.controlPoints.length - 1],
      [targetPos[0], targetPos[1], targetPos[2]],
      toRoom.center,
      transition.duration
    );

    return true;
  }

  // ─── Hotspot Interaction ─────────────────────────────────────────────────

  public getNearestHotspot(
    position: [number, number, number],
    maxDistance: number
  ): HotspotDefinition | null {
    let nearest: HotspotDefinition | null = null;
    let minDist = maxDistance;

    for (const room of this.rooms.values()) {
      for (const hotspot of room.hotspots) {
        const dx = position[0] - hotspot.position[0];
        const dy = position[1] - hotspot.position[1];
        const dz = position[2] - hotspot.position[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < minDist) {
          minDist = dist;
          nearest = hotspot;
        }
      }
    }

    return nearest;
  }

  public triggerHotspot(
    hotspotId: string,
    camera: LumenaryCamera
  ): void {
    for (const room of this.rooms.values()) {
      const hotspot = room.hotspots.find(h => h.id === hotspotId);
      if (!hotspot) continue;

      if (hotspot.type === 'transition' && hotspot.targetRoomId) {
        const currentRoom = this.activeRoomId;
        if (currentRoom) {
          this.startTransition(currentRoom, hotspot.targetRoomId, camera);
        }
      } else if (hotspot.type === 'viewpoint') {
        const currentTarget = camera.getTarget();
        const dx = hotspot.position[0] - currentTarget[0];
        const dz = hotspot.position[2] - currentTarget[2];
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 0.1) {
          camera.setOrbitTarget(hotspot.position);
        }
      }

      return;
    }
  }

  // ─── All Hotspots ────────────────────────────────────────────────────────

  public getAllHotspots(): HotspotDefinition[] {
    const all: HotspotDefinition[] = [];
    for (const room of this.rooms.values()) {
      for (const hotspot of room.hotspots) {
        all.push(hotspot);
      }
    }
    return all;
  }
}
