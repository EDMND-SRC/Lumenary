import type { PLYHeader, ProgressCallback } from './types';

const FLOATS_PER_SPLAT = 16;
const BYTES_PER_SPLAT = FLOATS_PER_SPLAT * 4; // 64

export class AssetManager {
  private device: GPUDevice;
  private textureCache: Map<string, GPUTexture>;
  private plyCache: Map<string, ArrayBuffer>;

  constructor(device: GPUDevice) {
    this.device = device;
    this.textureCache = new Map();
    this.plyCache = new Map();
  }

  // ─── PLY Streaming ─────────────────────────────────────────────────────

  public async streamPLY(
    url: string,
    onProgress: ProgressCallback
  ): Promise<{ header: PLYHeader; data: ArrayBuffer; packedSplatData: Float32Array }> {
    const buffer = await this.fetchWithProgress(url, onProgress);
    const header = this.parsePLYHeader(buffer);
    const packedSplatData = this.packVertexData(buffer, header.headerSize, header.vertexCount);
    return { header, data: buffer, packedSplatData };
  }

  public parsePLYHeader(buffer: ArrayBuffer): PLYHeader {
    const decoder = new TextDecoder();
    const raw = decoder.decode(new Uint8Array(buffer));
    const headerEnd = raw.indexOf('end_header');
    if (headerEnd === -1) {
      throw new Error('[AssetManager] PLY header malformed: missing end_header marker.');
    }

    const headerLines = raw.substring(0, headerEnd).split('\n');
    let vertexCount = 0;
    let format = 'binary_little_endian';

    for (const line of headerLines) {
      if (line.startsWith('element vertex')) {
        vertexCount = parseInt(line.split(' ').pop() || '0', 10);
      }
      if (line.startsWith('format')) {
        format = line.split(' ')[1] || format;
      }
    }

    const headerSize = headerEnd + 'end_header'.length + 1;
    return { vertexCount, headerSize, format };
  }

  public packVertexData(
    buffer: ArrayBuffer,
    headerSize: number,
    vertexCount: number
  ): Float32Array {
    const dataView = new DataView(buffer, headerSize);
    const packed = new Float32Array(vertexCount * FLOATS_PER_SPLAT);

    for (let i = 0; i < vertexCount; i++) {
      const offset = i * 48; // PLY binary vertex stride
      const base = i * FLOATS_PER_SPLAT;

      // Position: bytes 0-11 → packed[0-2]
      packed[base + 0] = dataView.getFloat32(offset + 0, true);
      packed[base + 1] = dataView.getFloat32(offset + 4, true);
      packed[base + 2] = dataView.getFloat32(offset + 8, true);
      // packed[3] = padding (already 0.0)

      // Scale: bytes 16-27 → packed[4-6]
      packed[base + 4] = dataView.getFloat32(offset + 16, true);
      packed[base + 5] = dataView.getFloat32(offset + 20, true);
      packed[base + 6] = dataView.getFloat32(offset + 24, true);
      // packed[7] = padding (already 0.0)

      // Color: bytes 12-15 → packed[8-11]
      packed[base + 8] = dataView.getUint8(offset + 12) / 255.0;
      packed[base + 9] = dataView.getUint8(offset + 13) / 255.0;
      packed[base + 10] = dataView.getUint8(offset + 14) / 255.0;
      packed[base + 11] = dataView.getUint8(offset + 15) / 255.0;

      // Rotation: bytes 28-43 → packed[12-15]
      packed[base + 12] = dataView.getFloat32(offset + 28, true);
      packed[base + 13] = dataView.getFloat32(offset + 32, true);
      packed[base + 14] = dataView.getFloat32(offset + 36, true);
      packed[base + 15] = dataView.getFloat32(offset + 40, true);
    }

    return packed;
  }

  // ─── Chunked Streaming ─────────────────────────────────────────────────

  public async streamPLYChunks(
    url: string,
    chunkSplatCount: number,
    onChunk: (chunk: Float32Array, chunkIndex: number, totalChunks: number) => void,
    onProgress: ProgressCallback
  ): Promise<PLYHeader> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`[AssetManager] Failed to fetch PLY from ${url}: ${response.status}`);
    }

    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('[AssetManager] Response body is not readable.');
    }

    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      receivedBytes += value.length;
      if (contentLength > 0) {
        onProgress(receivedBytes, contentLength);
      }
    }

    const totalBytes = chunks.reduce((acc, c) => acc + c.length, 0);
    const fullBuffer = new ArrayBuffer(totalBytes);
    const fullView = new Uint8Array(fullBuffer);
    let writeOffset = 0;
    for (const chunk of chunks) {
      fullView.set(chunk, writeOffset);
      writeOffset += chunk.length;
    }

    const header = this.parsePLYHeader(fullBuffer);
    const totalSplats = header.vertexCount;
    const totalChunks = Math.ceil(totalSplats / chunkSplatCount);

    for (let ci = 0; ci < totalChunks; ci++) {
      const startSplat = ci * chunkSplatCount;
      const endSplat = Math.min(startSplat + chunkSplatCount, totalSplats);
      const count = endSplat - startSplat;

      const chunkPacked = new Float32Array(count * FLOATS_PER_SPLAT);
      const dataView = new DataView(fullBuffer, header.headerSize);

      for (let i = 0; i < count; i++) {
        const srcOffset = (startSplat + i) * 48;
        const dstBase = i * FLOATS_PER_SPLAT;

        chunkPacked[dstBase + 0] = dataView.getFloat32(srcOffset + 0, true);
        chunkPacked[dstBase + 1] = dataView.getFloat32(srcOffset + 4, true);
        chunkPacked[dstBase + 2] = dataView.getFloat32(srcOffset + 8, true);

        chunkPacked[dstBase + 4] = dataView.getFloat32(srcOffset + 16, true);
        chunkPacked[dstBase + 5] = dataView.getFloat32(srcOffset + 20, true);
        chunkPacked[dstBase + 6] = dataView.getFloat32(srcOffset + 24, true);

        chunkPacked[dstBase + 8] = dataView.getUint8(srcOffset + 12) / 255.0;
        chunkPacked[dstBase + 9] = dataView.getUint8(srcOffset + 13) / 255.0;
        chunkPacked[dstBase + 10] = dataView.getUint8(srcOffset + 14) / 255.0;
        chunkPacked[dstBase + 11] = dataView.getUint8(srcOffset + 15) / 255.0;

        chunkPacked[dstBase + 12] = dataView.getFloat32(srcOffset + 28, true);
        chunkPacked[dstBase + 13] = dataView.getFloat32(srcOffset + 32, true);
        chunkPacked[dstBase + 14] = dataView.getFloat32(srcOffset + 36, true);
        chunkPacked[dstBase + 15] = dataView.getFloat32(srcOffset + 40, true);
      }

      onChunk(chunkPacked, ci, totalChunks);
    }

    return header;
  }

  // ─── Texture Management ────────────────────────────────────────────────

  public async loadTexture(url: string): Promise<GPUTexture> {
    const cached = this.textureCache.get(url);
    if (cached) return cached;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`[AssetManager] Failed to fetch texture from ${url}: ${response.status}`);
    }

    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const texture = this.device.createTexture({
      size: [bitmap.width, bitmap.height, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      label: `Texture_${url.split('/').pop() || 'unknown'}`
    });

    this.device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture: texture },
      [bitmap.width, bitmap.height, 1]
    );

    this.textureCache.set(url, texture);
    return texture;
  }

  public getCachedTexture(url: string): GPUTexture | undefined {
    return this.textureCache.get(url);
  }

  public clearCache(): void {
    for (const texture of this.textureCache.values()) {
      texture.destroy();
    }
    this.textureCache.clear();
    this.plyCache.clear();
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private async fetchWithProgress(
    url: string,
    onProgress: ProgressCallback
  ): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`[AssetManager] Failed to fetch from ${url}: ${response.status}`);
    }

    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('[AssetManager] Response body is not readable.');
    }

    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      receivedBytes += value.length;
      if (contentLength > 0) {
        onProgress(receivedBytes, contentLength);
      }
    }

    const totalBytes = chunks.reduce((acc, c) => acc + c.length, 0);
    const buffer = new ArrayBuffer(totalBytes);
    const view = new Uint8Array(buffer);
    let offset = 0;
    for (const chunk of chunks) {
      view.set(chunk, offset);
      offset += chunk.length;
    }

    return buffer;
  }
}
