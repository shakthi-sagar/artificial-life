import type { Universe } from "./engine.js";

const WGSL = /* wgsl */ `
struct P {
  count: u32,
  species: u32,
  repel: f32,
  force: f32,
  friction: f32,
  worldW: f32,
  worldH: f32,
  pad: f32,
};

@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read_write> pos: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> vel: array<vec2f>;
@group(0) @binding(3) var<storage, read> sp: array<u32>;
@group(0) @binding(4) var<storage, read> rules: array<f32>;
@group(0) @binding(5) var<storage, read> radii: array<vec2f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= p.count) { return; }
  let a = pos[i];
  let ca = sp[i];
  let hw = p.worldW * 0.5;
  let hh = p.worldH * 0.5;
  var fx = 0.0;
  var fy = 0.0;
  for (var j: u32 = 0u; j < p.count; j = j + 1u) {
    if (j == i) { continue; }
    var d = pos[j] - a;
    if (d.x > hw) { d.x = d.x - p.worldW; } else if (d.x < -hw) { d.x = d.x + p.worldW; }
    if (d.y > hh) { d.y = d.y - p.worldH; } else if (d.y < -hh) { d.y = d.y + p.worldH; }
    let m = ca * p.species + sp[j];
    let maxR = radii[m].y;
    let d2 = dot(d, d);
    if (d2 >= maxR * maxR || d2 < 1e-8) { continue; }
    let dist = sqrt(d2);
    let minR = radii[m].x;
    var f: f32;
    if (dist < minR) {
      f = (p.repel / minR) * dist - p.repel;
    } else {
      let mid = (minR + maxR) * 0.5;
      let slope = rules[m] / (mid - minR);
      f = -(slope * abs(dist - mid)) + rules[m];
    }
    fx = fx + (d.x / dist) * f;
    fy = fy + (d.y / dist) * f;
  }
  let damp = 1.0 - p.friction;
  let nv = vec2f((vel[i].x + fx * p.force) * damp, (vel[i].y + fy * p.force) * damp);
  vel[i] = nv;
  var np = a + nv;
  np.x = np.x - p.worldW * floor(np.x / p.worldW);
  np.y = np.y - p.worldH * floor(np.y / p.worldH);
  pos[i] = np;
}
`;

/** WebGPU bitflag globals — read lazily, never at module scope: Firefox/Safari without WebGPU
 *  don't define them, and touching them on import kills the whole bundle. */
const U = () => GPUBufferUsage;
const M = () => GPUMapMode;
const S = () => GPUShaderStage;

/** writeBuffer wants ArrayBuffer-backed views; cast past TS lib variance. */
function wb(q: GPUQueue, buf: GPUBuffer, src: ArrayBufferView) {
  q.writeBuffer(buf, 0, src as unknown as GPUAllowSharedBufferSource);
}

/** One GPU particle: pos, vel interleaved; sp u32; rules f32; radii vec2. */
export class GPUEngine {
  private device!: GPUDevice;
  /** set by the owner to fall back to CPU on device validation errors */
  onError: ((msg: string) => void) | null = null;
  private pipeline!: GPUComputePipeline;
  private bg: GPUBindGroup | null = null;
  private posB!: GPUBuffer;
  private velB!: GPUBuffer;
  private spB!: GPUBuffer;
  private rulesB!: GPUBuffer;
  private radiiB!: GPUBuffer;
  private paramsB!: GPUBuffer;
  private readB!: GPUBuffer;
  private cap = 0;
  private speciesB = 0;
  private lastMat = -1;
  private lastLife = -1;

  static async create(): Promise<GPUEngine> {
    if (typeof navigator === "undefined" || !navigator.gpu) throw new Error("WebGPU unavailable");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("no adapter");
    const e = new GPUEngine();
    e.device = await adapter.requestDevice();
    e.device.addEventListener("uncapturederror", (ev) => {
      const msg = (ev as GPUUncapturedErrorEvent).error?.message ?? "unknown GPU error";
      console.error("[ParticleLife GPU]", msg);
      e.onError?.(msg);
    });
    const module = e.device.createShaderModule({ code: WGSL });
    const bgl = e.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: S().COMPUTE, buffer: { type: "uniform" } },
        { binding: 1, visibility: S().COMPUTE, buffer: { type: "storage" } },
        { binding: 2, visibility: S().COMPUTE, buffer: { type: "storage" } },
        { binding: 3, visibility: S().COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 4, visibility: S().COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 5, visibility: S().COMPUTE, buffer: { type: "read-only-storage" } },
      ],
    });
    const layout = e.device.createPipelineLayout({ bindGroupLayouts: [bgl] });
    e.pipeline = e.device.createComputePipeline({ layout, compute: { module, entryPoint: "main" } });
    e.paramsB = e.device.createBuffer({ size: 32, usage: U().UNIFORM | U().COPY_DST });
    return e;
  }

  private rebuild(count: number, species: number) {
    for (const b of [this.posB, this.velB, this.spB, this.readB, this.rulesB, this.radiiB]) b?.destroy();
    const d = this.device;
    this.posB = d.createBuffer({ size: 8 * count, usage: U().STORAGE | U().COPY_SRC | U().COPY_DST });
    this.velB = d.createBuffer({ size: 8 * count, usage: U().STORAGE | U().COPY_DST });
    this.spB = d.createBuffer({ size: 4 * count, usage: U().STORAGE | U().COPY_DST });
    this.readB = d.createBuffer({ size: 8 * count, usage: U().MAP_READ | U().COPY_DST });
    this.rulesB = d.createBuffer({ size: 4 * species * species, usage: U().STORAGE | U().COPY_DST });
    this.radiiB = d.createBuffer({ size: 8 * species * species, usage: U().STORAGE | U().COPY_DST });
    this.bg = d.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.paramsB } },
        { binding: 1, resource: { buffer: this.posB } },
        { binding: 2, resource: { buffer: this.velB } },
        { binding: 3, resource: { buffer: this.spB } },
        { binding: 4, resource: { buffer: this.rulesB } },
        { binding: 5, resource: { buffer: this.radiiB } },
      ],
    });
    this.cap = count;
    this.speciesB = species;
    this.lastMat = -1;
    this.lastLife = -1;
  }

  /** Upload CPU-side state that changed: matrices (matRev) or respawns (lifeRev). */
  private ensure(u: Universe, matRev: number, lifeRev: number) {
    const n = u.params.count;
    const s = u.params.species;
    if (n !== this.cap || s !== this.speciesB) this.rebuild(n, s);

    const q = this.device.queue;
    if (matRev !== this.lastMat) {
      const radii = new Float32Array(s * s * 2);
      for (let i = 0; i < s * s; i++) {
        radii[2 * i] = u.minR[i];
        radii[2 * i + 1] = u.maxR[i];
      }
      wb(q, this.rulesB, u.rules);
      wb(q, this.radiiB, radii);
      this.lastMat = matRev;
    }
    if (lifeRev !== this.lastLife) {
      const sp32 = new Uint32Array(n);
      const vel = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        sp32[i] = u.sp[i];
        vel[2 * i] = u.vx[i];
        vel[2 * i + 1] = u.vy[i];
      }
      const pos = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        pos[2 * i] = u.px[i];
        pos[2 * i + 1] = u.py[i];
      }
      wb(q, this.spB, sp32);
      wb(q, this.velB, vel);
      wb(q, this.posB, pos);
      this.lastLife = lifeRev;
    }
  }

  /** One physics step on GPU; positions are read back into `u` for the canvas renderer. */
  async step(u: Universe, matRev: number, lifeRev: number) {
    this.ensure(u, matRev, lifeRev);
    const p = u.params;
    const ab = new ArrayBuffer(32);
    const u32 = new Uint32Array(ab);
    const f32 = new Float32Array(ab);
    u32[0] = p.count;
    u32[1] = p.species;
    f32[2] = p.repel;
    f32[3] = p.force;
    f32[4] = p.friction;
    f32[5] = p.worldW;
    f32[6] = p.worldH;
    this.device.queue.writeBuffer(this.paramsB, 0, ab as unknown as GPUAllowSharedBufferSource);

    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bg);
    pass.dispatchWorkgroups(Math.ceil(p.count / 64));
    pass.end();
    enc.copyBufferToBuffer(this.posB, 0, this.readB, 0, p.count * 8);
    this.device.queue.submit([enc.finish()]);

    await this.readB.mapAsync(M().READ);
    const src = new Float32Array(this.readB.getMappedRange());
    for (let i = 0; i < p.count; i++) {
      u.px[i] = src[2 * i];
      u.py[i] = src[2 * i + 1];
    }
    this.readB.unmap();
  }

  destroy() {
    for (const b of [this.posB, this.velB, this.spB, this.readB, this.rulesB, this.radiiB, this.paramsB]) b?.destroy();
    this.device.destroy();
  }
}
