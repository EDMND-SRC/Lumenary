export const LUMENARY_WGSL_SHADER = `
struct CameraUniforms {
    viewProjectionMatrix : mat4x4<f32>,
    viewMatrix           : mat4x4<f32>,
    projectionMatrix     : mat4x4<f32>,
    cameraPosition       : vec4<f32>,
};

struct GaussianSplat {
    position : vec3<f32>,
    scale    : vec3<f32>,
    color    : vec4<f32>,
    rotation : vec4<f32>,
};

struct SplatSortOutput {
    splatIndex : u32,
    depthIndex : f32,
};

// --- BINDING GROUP 0: SHARED MATRIX MEMORY PIPELINES ---
@group(0) @binding(0) var<uniform> camera       : CameraUniforms;
@group(0) @binding(1) var<storage, read> splatPool: array<GaussianSplat>;

// --- BINDING GROUP 1: REAL-TIME COMPUTE BUFFER ARRAYS ---
@group(1) @binding(0) var<storage, read_write> sortOutput : array<SplatSortOutput>;
@group(1) @binding(1) var<storage, read_write> renderIndices: array<u32>;

struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) color         : vec4<f32>,
    @location(1) uv            : vec2<f32>,
};

// ============================================================================
// 1. COMPUTE KERNEL: SPATIAL TRANSFORM & ATOMIC DEPTH CALCULATION
// ============================================================================
@compute @workgroup_size(256)
fn compute_main(@builtin(global_invocation_id) globalId : vec3<u32>) {
    let index = globalId.x;
    
    // Bounds guard check to prevent reading memory outside allocated VRAM blocks
    if (index >= arrayLength(&splatPool)) {
        return;
    }

    let splat = splatPool[index];
    
    // Calculate the distance from the camera to determine sorting order
    let viewPos = camera.viewMatrix * vec4<f32>(splat.position, 1.0);
    let depth = -viewPos.z; 

    // Frustum Clipping Guard: Drop elements behind the lens camera structure
    if (depth < 0.1) {
        sortOutput[index].depthIndex = -1.0;
        sortOutput[index].splatIndex = index;
        return;
    }

    // Write directly to VRAM arrays for processing by the WASM Radix Sorter
    sortOutput[index].depthIndex = depth;
    sortOutput[index].splatIndex = index;
}

// ============================================================================
// 2. RENDER PIPELINE: RASTERISATION & SCREEN MULTIPLEXING
// ============================================================================
@vertex
fn vs_main(
    @builtin(vertex_index) vertexIndex : u32,
    @builtin(instance_index) instanceIndex : u32
) -> VertexOutput {
    // Read sorted index arrays directly to handle depth calculations smoothly
    let sortedSplatIndex = renderIndices[instanceIndex];
    let splat = splatPool[sortedSplatIndex];
    
    // Generate programmatic quad corner vertices dynamically via matrix loops
    var localUV = vec2<f32>(0.0, 0.0);
    if (vertexIndex == 1u || vertexIndex == 4u) { localUV.x = 1.0; }
    if (vertexIndex == 2u || vertexIndex == 5u) { localUV.y = 1.0; }
    if (vertexIndex == 3u) { localUV = vec2<f32>(1.0, 1.0); }

    // Shape vectors based on camera matrices to ensure correct billboard rendering
    let rightVector = vec3<f32>(camera.viewMatrix[0][0], camera.viewMatrix[1][0], camera.viewMatrix[2][0]);
    let upVector    = vec3<f32>(camera.viewMatrix[0][1], camera.viewMatrix[1][1], camera.viewMatrix[2][1]);

    let xWorldOffset = rightVector * (localUV.x - 0.5) * splat.scale.x * 2.0;
    let yWorldOffset = upVector * (localUV.y - 0.5) * splat.scale.y * 2.0;
    
    let finalizedWorldPos = splat.position + xWorldOffset + yWorldOffset;

    var output : VertexOutput;
    output.position = camera.viewProjectionMatrix * vec4<f32>(finalizedWorldPos, 1.0);
    output.color = splat.color;
    output.uv = localUV;
    
    return output;
}

@fragment
fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
    // High-fidelity alpha profile calculation
    let radialDistance = in.uv - vec2<f32>(0.5, 0.5);
    let powerFactor = dot(radialDistance, radialDistance);
    
    // Discard rendering artifacts outside the volumetric radius bounding sphere
    if (powerFactor > 0.25) { 
        discard; 
    }
    
    // Render soft, realistic edges using exponential decay profiles
    let exponentialGaussianFalloff = exp(-8.0 * powerFactor);
    let finalAlphaChannel = in.color.a * exponentialGaussianFalloff;
    
    return vec4<f32>(in.color.rgb, finalAlphaChannel);
}
`;
