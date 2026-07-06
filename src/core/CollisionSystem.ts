import { quat, vec3 } from 'wgpu-matrix';
import type { OBB, RoomDefinition } from './types';

type Vec3Arr = [number, number, number];

export class CollisionSystem {
  private rooms: RoomDefinition[];
  private activeRoomId: string | null;
  private wallPadding: number;
  private groundY: number;
  private eyeHeight: number;

  constructor(wallPadding: number = 0.15, groundY: number = -0.5, eyeHeight: number = 1.7) {
    this.rooms = [];
    this.activeRoomId = null;
    this.wallPadding = wallPadding;
    this.groundY = groundY;
    this.eyeHeight = eyeHeight;
  }

  // ─── Room Setup ──────────────────────────────────────────────────────────

  public loadRooms(rooms: RoomDefinition[]): void {
    this.rooms = rooms;
  }

  public getActiveRoom(): string | null {
    return this.activeRoomId;
  }

  // ─── Collision Detection ─────────────────────────────────────────────────

  public resolvePosition(
    currentPos: Vec3Arr,
    proposedPos: Vec3Arr,
    _deltaTime: number
  ): Vec3Arr {
    let resolved: Vec3Arr = [...proposedPos];

    // Ground plane clamp
    if (resolved[1] < this.groundY + this.eyeHeight) {
      resolved[1] = this.groundY + this.eyeHeight;
    }

    // Find the room the proposed position is in
    const targetRoom = this.getRoomAtPosition(resolved);

    if (targetRoom) {
      // Clamp to room bounds with padding
      resolved = this.clampToOBBWithPadding(targetRoom.bounds, resolved, this.wallPadding);

      // Wall sliding if coming from outside
      const currentRoom = this.getRoomAtPosition(currentPos);
      if (!currentRoom || currentRoom.id !== targetRoom.id) {
        resolved = this.slideAlongWalls(currentPos, resolved, targetRoom);
      }
    } else {
      // Outside all rooms — push back to nearest room boundary
      const nearestRoom = this.findNearestRoom(resolved);
      if (nearestRoom) {
        resolved = this.clampToOBBWithPadding(nearestRoom.bounds, resolved, this.wallPadding);
      }
    }

    // Update active room
    const finalRoom = this.getRoomAtPosition(resolved);
    this.activeRoomId = finalRoom ? finalRoom.id : this.activeRoomId;

    return resolved;
  }

  public isInBounds(position: Vec3Arr): boolean {
    for (const room of this.rooms) {
      if (this.obbContainsPoint(room.bounds, position)) {
        return true;
      }
    }
    return false;
  }

  public getRoomAtPosition(position: Vec3Arr): RoomDefinition | null {
    for (const room of this.rooms) {
      if (this.obbContainsPoint(room.bounds, position)) {
        return room;
      }
    }
    return null;
  }

  // ─── OBB Math ────────────────────────────────────────────────────────────

  private obbContainsPoint(obb: OBB, point: Vec3Arr): boolean {
    const local = this.obbGetLocalPoint(obb, point);
    return (
      Math.abs(local[0]) <= obb.halfExtents[0] &&
      Math.abs(local[1]) <= obb.halfExtents[1] &&
      Math.abs(local[2]) <= obb.halfExtents[2]
    );
  }

  private obbGetLocalPoint(obb: OBB, point: Vec3Arr): Vec3Arr {
    // Transform world point to OBB local space
    const diff: Vec3Arr = [
      point[0] - obb.center[0],
      point[1] - obb.center[1],
      point[2] - obb.center[2],
    ];
    const invRot = quat.inverse(obb.rotation);
    const rotated = vec3.transformQuat(diff, invRot);
    return [rotated[0], rotated[1], rotated[2]];
  }

  private obbGetWorldPoint(obb: OBB, localPoint: Vec3Arr): Vec3Arr {
    const rotated = vec3.transformQuat(localPoint, obb.rotation);
    return [
      rotated[0] + obb.center[0],
      rotated[1] + obb.center[1],
      rotated[2] + obb.center[2],
    ];
  }

  private obbGetNormals(obb: OBB): [Vec3Arr, Vec3Arr, Vec3Arr] {
    const axes: [Vec3Arr, Vec3Arr, Vec3Arr] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    return axes.map(axis => {
      const rotated = vec3.transformQuat(axis, obb.rotation);
      return [rotated[0], rotated[1], rotated[2]] as Vec3Arr;
    }) as [Vec3Arr, Vec3Arr, Vec3Arr];
  }

  private clampToOBBWithPadding(obb: OBB, point: Vec3Arr, padding: number): Vec3Arr {
    const local = this.obbGetLocalPoint(obb, point);
    const he = obb.halfExtents;

    // Clamp in local space with padding
    const clampedLocal: Vec3Arr = [
      Math.max(-he[0] + padding, Math.min(he[0] - padding, local[0])),
      Math.max(-he[1] + padding, Math.min(he[1] - padding, local[1])),
      Math.max(-he[2] + padding, Math.min(he[2] - padding, local[2])),
    ];

    return this.obbGetWorldPoint(obb, clampedLocal);
  }

  private distanceToOBB(obb: OBB, point: Vec3Arr): number {
    const local = this.obbGetLocalPoint(obb, point);
    const he = obb.halfExtents;

    let distSq = 0;
    for (let i = 0; i < 3; i++) {
      const v = local[i];
      if (v < -he[i]) distSq += (v + he[i]) * (v + he[i]);
      else if (v > he[i]) distSq += (v - he[i]) * (v - he[i]);
    }

    return Math.sqrt(distSq);
  }

  private findNearestRoom(position: Vec3Arr): RoomDefinition | null {
    let nearest: RoomDefinition | null = null;
    let minDist = Infinity;

    for (const room of this.rooms) {
      const dist = this.distanceToOBB(room.bounds, position);
      if (dist < minDist) {
        minDist = dist;
        nearest = room;
      }
    }

    return nearest;
  }

  // ─── Wall Sliding ────────────────────────────────────────────────────────

  private slideAlongWalls(
    currentPos: Vec3Arr,
    proposedPos: Vec3Arr,
    room: RoomDefinition
  ): Vec3Arr {
    const movement: Vec3Arr = [
      proposedPos[0] - currentPos[0],
      proposedPos[1] - currentPos[1],
      proposedPos[2] - currentPos[2],
    ];

    const moveLength = Math.sqrt(
      movement[0] * movement[0] +
      movement[1] * movement[1] +
      movement[2] * movement[2]
    );

    if (moveLength < 0.0001) return proposedPos;

    const normals = this.obbGetNormals(room.bounds);
    let slideResult: Vec3Arr = [...currentPos];

    // For each axis of the OBB, check if movement pushes through the wall
    for (let i = 0; i < 3; i++) {
      const normal = normals[i];
      const he = room.bounds.halfExtents[i];

      // Project current and proposed positions onto this axis
      const currentLocal = this.obbGetLocalPoint(room.bounds, slideResult);
      const proposedLocal = this.obbGetLocalPoint(room.bounds, proposedPos);

      const localDelta = proposedLocal[i] - currentLocal[i];
      const limit = he - this.wallPadding;

      if (Math.abs(proposedLocal[i]) > limit) {
        // Would clip through wall — project movement onto wall plane
        const normalDot = this.dotProduct(movement, normal);
        if (normalDot !== 0) {
          // Remove the component of movement that goes into the wall
          const wallSlide: Vec3Arr = [
            movement[0] - normalDot * normal[0],
            movement[1] - normalDot * normal[1],
            movement[2] - normalDot * normal[2],
          ];
          slideResult = [
            slideResult[0] + wallSlide[0],
            slideResult[1] + wallSlide[1],
            slideResult[2] + wallSlide[2],
          ];
        }
      }
    }

    // Final clamp to ensure we're within bounds
    return this.clampToOBBWithPadding(room.bounds, slideResult, this.wallPadding);
  }

  // ─── Utility ─────────────────────────────────────────────────────────────

  private dotProduct(a: Vec3Arr, b: Vec3Arr): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  private crossProduct(a: Vec3Arr, b: Vec3Arr): Vec3Arr {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  private normalize(v: Vec3Arr): Vec3Arr {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (len < 0.0001) return [0, 0, 0];
    return [v[0] / len, v[1] / len, v[2] / len];
  }
}
