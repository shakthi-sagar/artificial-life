import type { Rule } from "./engine.js";

const WGSL = /* wgsl */ `
struct P {
  cols: u32,
  rows: u32,
  born: u32,
  surv: u32,
};

@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> gin: array<u32>;
@group(0) @binding(2) var<storage, read_write> gout: array<u32>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x;
  let y = gid.y;
  if (x >= p.cols || y >= p.rows) { return; }
  var n: u32 = 0u;
  for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
    for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
      if (dx == 0 && dy == 0) { continue; }
      let nx = (i32(x) + dx + i32(p.cols)) % i32(p.cols);
      let ny = (i32(y) + dy + i32(p.rows)) % i32(p.rows);
      n = n + gin[u32(ny) * p.cols + u32(nx)];
    }
  }
  let alive = gin[y * p.cols + x];
  let mask = select(p.born, p.surv, alive == 1u);
  let bit = (mask >> n) & 1u;
  gout[y * p.cols + x] = select(0u, 1u, bit == 1u);
}
`;

/** WebGPU bitflag globals — read lazily, never at module scope: Firefox/Safari without WebGPU
 *  don't define them, and touching them on import kills the whole bundle. */
const U = () => GPUBufferUsage;
const M = () => GPUMapMode;
const S = () => GPUShaderStage;

const maskOf = (list: number[]) => list.reduce((m, n) => (n >= 0 && n <= 8 ? m | (1 << n) : m), 0);

/** Game of Life step on GPU: ping-pong grid buffers, toroidal B/S with rule bitmasks. */
export class GolGpu {
  private device!: GPUDevice;
  private pipeline!: GPUComputePipeline;
  private paramsB!: GPUBuffer;
  private gridA!: GPUBuffer;
  private gridB!: GPUBuffer;
  private readB!: GPUBuffer;
  private bgIn: GPUBindGroup | null = null;
  private bgOut: GPUBindGroup | null = null;
  private cols = 0;
  private rows = 0;
  private lastRule = -1;
  private lastCells = -1;
  private flip = false; // false: read A write B; true: read B write A

  static async create(): Promise<GolGpu> {
    if (typeof navigator === "undefined" || !navigator.gpu) throw new Error("WebGPU unavailable");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("no adapter");
    const e = new GolGpu();
    e.device = await adapter.requestDevice();
    const module = e.device.createShaderModule({ code: WGSL });
    const bgl = e.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: S().COMPUTE, buffer: { type: "uniform" } },
        { binding: 1, visibility: S().COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 2, visibility: S().COMPUTE, buffer: { type: "storage" } },
      ],
    });
    const layout = e.device.createPipelineLayout({ bindGroupLayouts: [bgl] });
    e.pipeline = e.device.createComputePipeline({ layout, compute: { module, entryPoint: "main" } });
    e.paramsB = e.device.createBuffer({ size: 16, usage: U().UNIFORM | U().COPY_DST });
    return e;
  }

  private rebuild(cols: number, rows: number) {
    for (const b of [this.gridA, this.gridB, this.readB]) b?.destroy();
    const d = this.device;
    const size = 4 * cols * rows;
    this.gridA = d.createBuffer({ size, usage: U().STORAGE | U().COPY_DST | U().COPY_SRC });
    this.gridB = d.createBuffer({ size, usage: U().STORAGE | U().COPY_DST | U().COPY_SRC });
    this.readB = d.createBuffer({ size, usage: U().MAP_READ | U().COPY_DST });
    const mk = (din: GPUBuffer, dout: GPUBuffer) =>
      d.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.paramsB } },
          { binding: 1, resource: { buffer: din } },
          { binding: 2, resource: { buffer: dout } },
        ],
      });
    this.bgIn = mk(this.gridA, this.gridB);
    this.bgOut = mk(this.gridB, this.gridA);
    this.cols = cols;
    this.rows = rows;
    this.lastCells = -1;
  }

  /**
   * @param cellRev bump whenever the CPU mutated the grid directly
   *                (paint, clear, stamp, resize) so state re-uploads.
   */
  private ensure(grid: Uint8Array, cols: number, rows: number, rule: Rule, cellRev: number) {
    if (cols !== this.cols || rows !== this.rows) this.rebuild(cols, rows);
    const q = this.device.queue;
    const ruleKey = maskOf(rule.born) * 512 + maskOf(rule.survives);
    if (ruleKey !== this.lastRule) {
      const ab = new ArrayBuffer(16);
      const u32 = new Uint32Array(ab);
      u32[0] = cols;
      u32[1] = rows;
      u32[2] = maskOf(rule.born);
      u32[3] = maskOf(rule.survives);
      q.writeBuffer(this.paramsB, 0, ab);
      this.lastRule = ruleKey;
    }
    if (cellRev !== this.lastCells) {
      const u32 = new Uint32Array(cols * rows);
      for (let i = 0; i < u32.length; i++) u32[i] = grid[i];
      q.writeBuffer(this.flip ? this.gridB : this.gridA, 0, u32);
      this.lastCells = cellRev;
    }
  }

  /** One generation on GPU; result read back into `grid`. Returns alive count. */
  async step(
    grid: Uint8Array, cols: number, rows: number,
    rule: Rule, cellRev: number,
  ): Promise<number> {
    this.ensure(grid, cols, rows, rule, cellRev);
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.flip ? this.bgOut : this.bgIn);
    pass.dispatchWorkgroups(Math.ceil(cols / 8), Math.ceil(rows / 8));
    pass.end();
    enc.copyBufferToBuffer(this.flip ? this.gridA : this.gridB, 0, this.readB, 0, cols * rows * 4);
    this.device.queue.submit([enc.finish()]);

    await this.readB.mapAsync(M().READ);
    const src = new Uint32Array(this.readB.getMappedRange());
    let pop = 0;
    for (let i = 0; i < grid.length; i++) {
      const v = src[i] ? 1 : 0;
      grid[i] = v;
      pop += v;
    }
    this.readB.unmap();
    this.flip = !this.flip;
    return pop;
  }

  destroy() {
    for (const b of [this.gridA, this.gridB, this.readB, this.paramsB]) b?.destroy();
    this.device.destroy();
  }
}
