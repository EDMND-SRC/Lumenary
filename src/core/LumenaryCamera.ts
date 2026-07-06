import { mat4, vec3, quat } from 'wgpu-matrix';
import type { CameraMode, CameraConfig } from './types';

const DEFAULT_CONFIG: CameraConfig = {
  moveSpeed: 5.0,
  lookSensitivity: 0.002,
  interpolationFactor: 0.12,
  orbitMinDistance: 1.0,
  orbitMaxDistance: 30.0,
};

const MAX_PITCH = (89 * Math.PI) / 180;
const MIN_PITCH = -MAX_PITCH;

export class LumenaryCamera {
  // ─── FPS state ───
  private position: Float32Array;
  private targetPosition: Float32Array;
  private yaw: number;
  private pitch: number;
  private targetYaw: number;
  private targetPitch: number;

  // ─── Orbit state ───
  private orbitTarget: Float32Array;
  private orbitDistance: number;
  private orbitYaw: number;
  private orbitPitch: number;
  private targetOrbitYaw: number;
  private targetOrbitPitch: number;
  private targetOrbitDistance: number;

  // ─── Config ───
  private moveSpeed: number;
  private lookSensitivity: number;
  private interpolationFactor: number;
  private orbitMinDistance: number;
  private orbitMaxDistance: number;

  // ─── Mode ───
  private mode: CameraMode;

  // ─── Matrices ───
  private viewMatrix: Float32Array;
  private projectionMatrix: Float32Array;

  // ─── Input state ───
  private keys: Set<string>;
  private mouseDeltaX: number;
  private mouseDeltaY: number;
  private isPointerLocked: boolean;
  private isRightMouseDown: boolean;
  private lastMouseX: number;
  private lastMouseY: number;

  // ─── Transition animation ───
  private isTransitioning: boolean;
  private transitionFrom: Float32Array;
  private transitionTo: Float32Array;
  private transitionTargetFrom: Float32Array;
  private transitionTargetTo: Float32Array;
  private transitionDuration: number;
  private transitionElapsed: number;

  // ─── Bindings ───
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundPointerLockChange: () => void;
  private boundWheel: (e: WheelEvent) => void;
  private boundContextMenu: (e: MouseEvent) => void;
  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private canvas: HTMLCanvasElement;

  constructor(config: Partial<CameraConfig>, canvas: HTMLCanvasElement) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    this.moveSpeed = cfg.moveSpeed;
    this.lookSensitivity = cfg.lookSensitivity;
    this.interpolationFactor = cfg.interpolationFactor;
    this.orbitMinDistance = cfg.orbitMinDistance;
    this.orbitMaxDistance = cfg.orbitMaxDistance;

    this.canvas = canvas;
    this.mode = 'fps';

    this.position = new Float32Array([5.0, 3.0, 5.0]);
    this.targetPosition = new Float32Array([5.0, 3.0, 5.0]);
    this.yaw = 0;
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;

    this.orbitTarget = new Float32Array([0.0, 0.0, 0.0]);
    this.orbitDistance = 8.0;
    this.orbitYaw = 0;
    this.orbitPitch = 0.3;
    this.targetOrbitYaw = 0;
    this.targetOrbitPitch = 0.3;
    this.targetOrbitDistance = 8.0;

    this.viewMatrix = mat4.identity();
    this.projectionMatrix = mat4.identity();

    this.keys = new Set();
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.isPointerLocked = false;
    this.isRightMouseDown = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    this.isTransitioning = false;
    this.transitionFrom = new Float32Array(3);
    this.transitionTo = new Float32Array(3);
    this.transitionTargetFrom = new Float32Array(3);
    this.transitionTargetTo = new Float32Array(3);
    this.transitionDuration = 0;
    this.transitionElapsed = 0;

    this.boundKeyDown = this.onKeyDown.bind(this);
    this.boundKeyUp = this.onKeyUp.bind(this);
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundPointerLockChange = this.onPointerLockChange.bind(this);
    this.boundWheel = this.onWheel.bind(this);
    this.boundContextMenu = this.onContextMenu.bind(this);
    this.boundMouseDown = this.onMouseDown.bind(this);
    this.boundMouseUp = this.onMouseUp.bind(this);

    this.attachInputHandlers();
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  public getPosition(): Readonly<Float32Array> {
    return this.position;
  }

  public getTarget(): Float32Array {
    if (this.mode === 'fps') {
      const forward = this.getForwardVector();
      return new Float32Array([
        this.position[0] + forward[0],
        this.position[1] + forward[1],
        this.position[2] + forward[2],
      ]);
    }
    return new Float32Array(this.orbitTarget);
  }

  public getOrbitTarget(): Readonly<Float32Array> {
    return this.orbitTarget;
  }

  public getViewMatrix(): Float32Array {
    return this.viewMatrix;
  }

  public getProjectionMatrix(): Float32Array {
    return this.projectionMatrix;
  }

  public getMode(): CameraMode {
    return this.mode;
  }

  public setPosition(pos: [number, number, number]): void {
    this.position[0] = pos[0];
    this.position[1] = pos[1];
    this.position[2] = pos[2];
    this.targetPosition[0] = pos[0];
    this.targetPosition[1] = pos[1];
    this.targetPosition[2] = pos[2];
  }

  public setTarget(target: [number, number, number]): void {
    const dx = target[0] - this.position[0];
    const dy = target[1] - this.position[1];
    const dz = target[2] - this.position[2];
    this.yaw = Math.atan2(dx, dz);
    this.pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
  }

  public setMode(mode: CameraMode): void {
    if (mode === this.mode) return;

    if (mode === 'orbit') {
      const forward = this.getForwardVector();
      this.orbitTarget[0] = this.position[0] + forward[0] * 5.0;
      this.orbitTarget[1] = this.position[1] + forward[1] * 5.0;
      this.orbitTarget[2] = this.position[2] + forward[2] * 5.0;
      this.orbitDistance = 8.0;
      this.orbitYaw = this.yaw;
      this.orbitPitch = this.pitch;
      this.targetOrbitYaw = this.orbitYaw;
      this.targetOrbitPitch = this.orbitPitch;
      this.targetOrbitDistance = this.orbitDistance;

      if (this.isPointerLocked) {
        document.exitPointerLock();
      }
    } else {
      if (this.isTransitioning) return;
      const orbitPos = this.computeOrbitCameraPosition();
      this.position[0] = orbitPos[0];
      this.position[1] = orbitPos[1];
      this.position[2] = orbitPos[2];
      this.targetPosition[0] = this.position[0];
      this.targetPosition[1] = this.position[1];
      this.targetPosition[2] = this.position[2];
      this.yaw = this.orbitYaw;
      this.pitch = this.orbitPitch;
      this.targetYaw = this.yaw;
      this.targetPitch = this.pitch;
    }

    this.mode = mode;
  }

  public setOrbitTarget(target: [number, number, number]): void {
    this.orbitTarget[0] = target[0];
    this.orbitTarget[1] = target[1];
    this.orbitTarget[2] = target[2];
  }

  // ─── Transition Animation ───

  public startTransition(
    from: [number, number, number],
    to: [number, number, number],
    targetFrom: [number, number, number],
    targetTo: [number, number, number],
    duration: number
  ): void {
    this.transitionFrom[0] = from[0];
    this.transitionFrom[1] = from[1];
    this.transitionFrom[2] = from[2];
    this.transitionTo[0] = to[0];
    this.transitionTo[1] = to[1];
    this.transitionTo[2] = to[2];
    this.transitionTargetFrom[0] = targetFrom[0];
    this.transitionTargetFrom[1] = targetFrom[1];
    this.transitionTargetFrom[2] = targetFrom[2];
    this.transitionTargetTo[0] = targetTo[0];
    this.transitionTargetTo[1] = targetTo[1];
    this.transitionTargetTo[2] = targetTo[2];
    this.transitionDuration = duration;
    this.transitionElapsed = 0;
    this.isTransitioning = true;
  }

  public isCameraTransitioning(): boolean {
    return this.isTransitioning;
  }

  // ─── Update Loop ───

  public update(deltaTime: number): void {
    if (this.isTransitioning) {
      this.updateTransition(deltaTime);
      this.rebuildViewMatrix();
      return;
    }

    if (this.mode === 'fps') {
      this.updateFPS(deltaTime);
    } else {
      this.updateOrbit(deltaTime);
    }

    this.rebuildViewMatrix();
  }

  public updateProjectionMatrix(aspectRatio: number): void {
    mat4.perspective(Math.PI / 3, aspectRatio, 0.1, 100.0, this.projectionMatrix);
  }

  // ─── FPS Mode ────────────────────────────────────────────────────────────

  private updateFPS(deltaTime: number): void {
    if (!this.isPointerLocked) return;

    // Apply mouse delta to yaw/pitch
    this.targetYaw -= this.mouseDeltaX * this.lookSensitivity;
    this.targetPitch -= this.mouseDeltaY * this.lookSensitivity;
    this.targetPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.targetPitch));

    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;

    // Interpolate yaw/pitch
    this.yaw = this.lerpAngle(this.yaw, this.targetYaw, this.interpolationFactor);
    this.pitch = this.lerpValue(this.pitch, this.targetPitch, this.interpolationFactor);

    // Compute movement direction
    const forward = this.getForwardVector();
    const right = this.getRightVector();

    let moveX = 0;
    let moveZ = 0;

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveZ += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveZ -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;

    // Normalize diagonal movement
    const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (moveLen > 0) {
      moveX /= moveLen;
      moveZ /= moveLen;
    }

    const speed = this.moveSpeed * deltaTime;
    this.targetPosition[0] = this.position[0] + (forward[0] * moveZ + right[0] * moveX) * speed;
    this.targetPosition[1] = this.position[1];
    this.targetPosition[2] = this.position[2] + (forward[2] * moveZ + right[2] * moveX) * speed;

    // Vertical movement
    if (this.keys.has('Space')) {
      this.targetPosition[1] += speed;
    }
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) {
      this.targetPosition[1] -= speed;
    }

    // Interpolate position
    this.position[0] = this.lerpValue(this.position[0], this.targetPosition[0], this.interpolationFactor);
    this.position[1] = this.lerpValue(this.position[1], this.targetPosition[1], this.interpolationFactor);
    this.position[2] = this.lerpValue(this.position[2], this.targetPosition[2], this.interpolationFactor);
  }

  // ─── Orbit Mode ──────────────────────────────────────────────────────────

  private updateOrbit(deltaTime: number): void {
    // Apply mouse delta for orbit rotation
    if (this.isRightMouseDown) {
      this.targetOrbitYaw -= this.mouseDeltaX * this.lookSensitivity;
      this.targetOrbitPitch += this.mouseDeltaY * this.lookSensitivity;
      this.targetOrbitPitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.targetOrbitPitch));
    }

    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;

    // Interpolate orbit parameters
    this.orbitYaw = this.lerpAngle(this.orbitYaw, this.targetOrbitYaw, this.interpolationFactor);
    this.orbitPitch = this.lerpValue(this.orbitPitch, this.targetOrbitPitch, this.interpolationFactor);
    this.orbitDistance = this.lerpValue(this.orbitDistance, this.targetOrbitDistance, this.interpolationFactor);

    // Compute camera position from orbit parameters
    const orbitPos = this.computeOrbitCameraPosition();
    this.position[0] = orbitPos[0];
    this.position[1] = orbitPos[1];
    this.position[2] = orbitPos[2];
  }

  private computeOrbitCameraPosition(): Float32Array {
    const x = this.orbitTarget[0] + this.orbitDistance * Math.cos(this.orbitPitch) * Math.sin(this.orbitYaw);
    const y = this.orbitTarget[1] + this.orbitDistance * Math.sin(this.orbitPitch);
    const z = this.orbitTarget[2] + this.orbitDistance * Math.cos(this.orbitPitch) * Math.cos(this.orbitYaw);
    return new Float32Array([x, y, z]);
  }

  // ─── Transition ──────────────────────────────────────────────────────────

  private updateTransition(deltaTime: number): void {
    this.transitionElapsed += deltaTime;
    const t = Math.min(this.transitionElapsed / this.transitionDuration, 1.0);
    const eased = this.easeInOutCubic(t);

    this.position[0] = this.lerpValue(this.transitionFrom[0], this.transitionTo[0], eased);
    this.position[1] = this.lerpValue(this.transitionFrom[1], this.transitionTo[1], eased);
    this.position[2] = this.lerpValue(this.transitionFrom[2], this.transitionTo[2], eased);

    const targetX = this.lerpValue(this.transitionTargetFrom[0], this.transitionTargetTo[0], eased);
    const targetY = this.lerpValue(this.transitionTargetFrom[1], this.transitionTargetTo[1], eased);
    const targetZ = this.lerpValue(this.transitionTargetFrom[2], this.transitionTargetTo[2], eased);

    const dx = targetX - this.position[0];
    const dy = targetY - this.position[1];
    const dz = targetZ - this.position[2];
    this.yaw = Math.atan2(dx, dz);
    this.pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));

    if (t >= 1.0) {
      this.isTransitioning = false;
      this.targetPosition[0] = this.position[0];
      this.targetPosition[1] = this.position[1];
      this.targetPosition[2] = this.position[2];
      this.targetYaw = this.yaw;
      this.targetPitch = this.pitch;
    }
  }

  // ─── Matrix Rebuild ──────────────────────────────────────────────────────

  private rebuildViewMatrix(): void {
    const target = this.getTarget();
    const up: Float32Array = new Float32Array([0.0, 1.0, 0.0]);
    mat4.lookAt(this.position, target, up, this.viewMatrix);
  }

  // ─── Direction Vectors ───────────────────────────────────────────────────

  private getForwardVector(): Float32Array {
    return new Float32Array([
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ]);
  }

  private getRightVector(): Float32Array {
    return new Float32Array([
      Math.cos(this.yaw),
      0.0,
      -Math.sin(this.yaw),
    ]);
  }

  // ─── Math Helpers ────────────────────────────────────────────────────────

  private lerpValue(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // ─── Input Handlers ──────────────────────────────────────────────────────

  private attachInputHandlers(): void {
    document.addEventListener('keydown', this.boundKeyDown);
    document.addEventListener('keyup', this.boundKeyUp);
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('pointerlockchange', this.boundPointerLockChange);
    this.canvas.addEventListener('wheel', this.boundWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.boundContextMenu);
    this.canvas.addEventListener('mousedown', this.boundMouseDown);
    document.addEventListener('mouseup', this.boundMouseUp);

    this.canvas.addEventListener('click', () => {
      if (this.mode === 'fps' && !this.isPointerLocked) {
        this.canvas.requestPointerLock();
      }
    });
  }

  public detachInputHandlers(): void {
    document.removeEventListener('keydown', this.boundKeyDown);
    document.removeEventListener('keyup', this.boundKeyUp);
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('pointerlockchange', this.boundPointerLockChange);
    this.canvas.removeEventListener('wheel', this.boundWheel);
    this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
    this.canvas.removeEventListener('mousedown', this.boundMouseDown);
    document.removeEventListener('mouseup', this.boundMouseUp);
  }

  private onKeyDown(event: KeyboardEvent): void {
    this.keys.add(event.code);

    if (event.code === 'Tab') {
      event.preventDefault();
      this.setMode(this.mode === 'fps' ? 'orbit' : 'fps');
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.keys.delete(event.code);
  }

  private onMouseMove(event: MouseEvent): void {
    if (this.mode === 'fps' && this.isPointerLocked) {
      this.mouseDeltaX += event.movementX;
      this.mouseDeltaY += event.movementY;
    } else if (this.mode === 'orbit' && this.isRightMouseDown) {
      this.mouseDeltaX += event.movementX;
      this.mouseDeltaY += event.movementY;
    }
  }

  private onPointerLockChange(): void {
    this.isPointerLocked = document.pointerLockElement === this.canvas;
  }

  private onWheel(event: WheelEvent): void {
    if (this.mode === 'orbit') {
      event.preventDefault();
      this.targetOrbitDistance += event.deltaY * 0.01;
      this.targetOrbitDistance = Math.max(
        this.orbitMinDistance,
        Math.min(this.orbitMaxDistance, this.targetOrbitDistance)
      );
    }
  }

  private onContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button === 2) {
      this.isRightMouseDown = true;
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
    }
  }

  private onMouseUp(event: MouseEvent): void {
    if (event.button === 2) {
      this.isRightMouseDown = false;
    }
  }
}
