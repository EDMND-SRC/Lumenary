import { mat4, Vec3 } from 'wgpu-matrix';
import { LUMENARY_WGSL_SHADER } from './shaders';

export interface LumenaryEngineConfig {
  canvasElementId: string;
  maxSplatCount: number;
}

// WGSL GaussianSplat struct alignment:
//   position : vec3<f32>  → offset 0,  size 12,  alignment 16
//   (padding)             → offset 12, size 4
//   scale    : vec3<f32>  → offset 16, size 12,  alignment 16
//   (padding)             → offset 28, size 4
//   color    : vec4<f32>  → offset 32, size 16,  alignment 16
//   rotation : vec4<f32>  → offset 48, size 16,  alignment 16
//   Total: 64 bytes per splat.
const BYTES_PER_SPLAT = 64;
const FLOATS_PER_SPLAT = BYTES_PER_SPLAT / 4; // 16

export class LumenaryWebGPUContext {
  private canvas: HTMLCanvasElement;
  private adapter!: GPUAdapter;
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private renderPipeline!: GPURenderPipeline;
  private computePipeline!: GPUComputePipeline;

  private viewMatrix: Float32Array = mat4.identity();
  private projectionMatrix: Float32Array = mat4.identity();
  private viewProjectionMatrix: Float32Array = mat4.identity();

  private cameraUniformBuffer!: GPUBuffer;
  private splatStorageBuffer!: GPUBuffer;
  private sortOutputBuffer!: GPUBuffer;
  private renderIndicesBuffer!: GPUBuffer;
  private cameraBindGroup!: GPUBindGroup;
  private computeBindGroup!: GPUBindGroup;
  private sortBindGroup!: GPUBindGroup;
  private cameraDataBuffer: Float32Array = new Float32Array(52);
  private resizeObserver!: ResizeObserver;

  private actualSplatCount: number = 0;

  constructor(private config: LumenaryEngineConfig) {
    const targetCanvas = document.getElementById(config.canvasElementId);
    if (!(targetCanvas instanceof HTMLCanvasElement)) {
      throw new Error(`[Lumenary Core] Fatal: #${config.canvasElementId} is not a valid Canvas element.`);
    }
    this.canvas = targetCanvas;
  }

  public async initializeHardwarePipeline(): Promise<boolean> {
    if (!navigator.gpu) {
      throw new Error("[Lumenary Core] Fatal: WebGPU hardware layer is unavailable on this client.");
    }

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return false;
    this.adapter = adapter;

    this.device = await this.adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: 512 * 1024 * 1024
      }
    });

    this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;

    this.context.configure({
      device: this.device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: 'opaque'
    });

    this.allocateProductionBuffers();
    this.compileRenderPipelines();
    this.attachResizeHandler();
    return true;
  }

  private attachResizeHandler(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(this.canvas);
  }

  public resize(): void {
    const dpr: number = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    mat4.perspective(Math.PI / 3, this.canvas.width / this.canvas.height, 0.1, 100.0, this.projectionMatrix);
  }

  private allocateProductionBuffers(): void {
    // 208-byte camera uniform layout: viewProjection(64) + view(64) + projection(64) + position(16)
    const CAMERA_UNIFORM_SIZE = 208;
    this.cameraUniformBuffer = this.device.createBuffer({
      size: CAMERA_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: "Lumenary_Camera_Uniform_Layout"
    });

    // Each Gaussian splat uses a 64-byte stride to match WGSL struct alignment.
    this.splatStorageBuffer = this.device.createBuffer({
      size: this.config.maxSplatCount * BYTES_PER_SPLAT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: "Lumenary_Dense_Gaussian_VRAM_Pool"
    });

    // Sort output buffer: 8 bytes per splat (u32 index + f32 depth)
    this.sortOutputBuffer = this.device.createBuffer({
      size: this.config.maxSplatCount * 8,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: "Lumenary_Depth_Sort_Output"
    });

    // Render indices buffer: 4 bytes per splat (u32 sorted index)
    this.renderIndicesBuffer = this.device.createBuffer({
      size: this.config.maxSplatCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: "Lumenary_Render_Indices"
    });
  }

  private compileRenderPipelines(): void {
    const shaderModule = this.device.createShaderModule({
      code: LUMENARY_WGSL_SHADER,
      label: "Lumenary_Production_WGSL_Kernel"
    });

    this.computePipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'compute_main'
      }
    });

    this.renderPipeline = this.device.createRenderPipeline({
      label: "Lumenary_Cinematic_Pipeline_State",
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main'
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{
          format: navigator.gpu.getPreferredCanvasFormat(),
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
          }
        }]
      },
      primitive: { topology: 'triangle-list' }
    });

    this.computeBindGroup = this.device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraUniformBuffer } },
        { binding: 1, resource: { buffer: this.splatStorageBuffer } }
      ]
    });

    this.sortBindGroup = this.device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: this.sortOutputBuffer } },
        { binding: 1, resource: { buffer: this.renderIndicesBuffer } }
      ]
    });

    this.cameraBindGroup = this.device.createBindGroup({
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraUniformBuffer } },
        { binding: 1, resource: { buffer: this.splatStorageBuffer } }
      ]
    });
  }

  public updateViewMatrix(cameraPosition: number[], targetLookAt: number[]): void {
    const up: Vec3 = new Float32Array([0.0, 1.0, 0.0]);
    const pos: Vec3 = new Float32Array(cameraPosition);
    const target: Vec3 = new Float32Array(targetLookAt);
    mat4.lookAt(pos, target, up, this.viewMatrix);
    mat4.perspective(Math.PI / 3, this.canvas.width / this.canvas.height, 0.1, 100.0, this.projectionMatrix);
    mat4.multiply(this.projectionMatrix, this.viewMatrix, this.viewProjectionMatrix);

    this.cameraDataBuffer.set(this.viewProjectionMatrix, 0);
    this.cameraDataBuffer.set(this.viewMatrix, 16);
    this.cameraDataBuffer.set(this.projectionMatrix, 32);
    this.cameraDataBuffer[48] = cameraPosition[0];
    this.cameraDataBuffer[49] = cameraPosition[1];
    this.cameraDataBuffer[50] = cameraPosition[2];
    this.cameraDataBuffer[51] = 1.0;

    this.device.queue.writeBuffer(this.cameraUniformBuffer, 0, this.cameraDataBuffer.buffer, 0, 208);
  }

  public renderFrame(deltaTime: number, renderSplatCount: number): void {
    const splatCount = renderSplatCount > 0 ? renderSplatCount : this.actualSplatCount;
    if (splatCount === 0) return;

    const commandEncoder = this.device.createCommandEncoder();

    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroup);
    computePass.setBindGroup(1, this.sortBindGroup);
    const workgroupCount = Math.ceil(splatCount / 256);
    computePass.dispatchWorkgroups(workgroupCount);
    computePass.end();

    const textureView = this.context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.02, g: 0.02, b: 0.02, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });

    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, this.cameraBindGroup);
    renderPass.draw(6, splatCount, 0, 0);
    renderPass.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  public uploadSplatData(data: Float32Array): void {
    this.actualSplatCount = data.length / FLOATS_PER_SPLAT;
    this.device.queue.writeBuffer(this.splatStorageBuffer, 0, data.buffer, data.byteOffset, data.byteLength);
  }

  public uploadSplatDataChunk(data: Float32Array, offsetSplatIndex: number): void {
    const byteOffset = offsetSplatIndex * BYTES_PER_SPLAT;
    this.device.queue.writeBuffer(
      this.splatStorageBuffer,
      byteOffset,
      data.buffer,
      data.byteOffset,
      data.byteLength
    );
  }

  public getDevice(): GPUDevice {
    return this.device;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public getSplatCount(): number {
    return this.actualSplatCount;
  }

  public setActualSplatCount(count: number): void {
    this.actualSplatCount = count;
  }

  public getMaxSplatCount(): number {
    return this.config.maxSplatCount;
  }
}
