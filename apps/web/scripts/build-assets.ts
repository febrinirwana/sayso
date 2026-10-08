/**
 * Builds web-ready images from apps/web/assets-src (DESIGN section 9):
 * voxel WebP at 128/256 px, the transparent logo and mark, PWA icons, and the mascot voxel grid
 * sampled from the mark (src/three/mascot/grid.ts).
 * Deterministic: same sources produce the same files. Run: bun run --cwd apps/web assets
 * `--mascot` regenerates only the mascot grid.
 */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import sharp from "sharp";

const root = join(import.meta.dir, "..");
const src = join(root, "assets-src");
const voxelOut = join(root, "src/assets/voxels");
const brandOut = join(root, "src/assets/brand");
const iconOut = join(root, "public/icons");
const mascotOut = join(root, "src/three/mascot/grid.ts");
const paper = "#FDFBF4";
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

/** Body cells across the mascot's widest row; the face is sampled `MASCOT_FACE_SCALE` times finer. */
const MASCOT_COLS = 30;
const MASCOT_FACE_SCALE = 3;

type Ink = "bg" | "k" | "r" | "w";

/**
 * Samples the mark into two grids: the body (`k` outline, `r` red) and, at double resolution, the
 * white face split into `L`/`R` eyes and `S` smile so each part can animate on its own.
 */
async function mascot(): Promise<void> {
  const { data, info } = await sharp(join(src, "brand/sayso-icon.png"))
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const ink: Ink[] = new Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 3] ?? 0;
    const g = data[i * 3 + 1] ?? 0;
    const b = data[i * 3 + 2] ?? 0;
    if (Math.max(r, g, b) < 100) ink[i] = "k";
    else if (r > 150 && g < 120 && b < 120) ink[i] = "r";
    else ink[i] = "w";
  }
  // White reachable from the border is background; white enclosed by the outline is the face.
  const stack: number[] = [];
  const seed = (i: number) => {
    if (ink[i] === "w") {
      ink[i] = "bg";
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = i % width;
    if (x > 0) seed(i - 1);
    if (x < width - 1) seed(i + 1);
    if (i >= width) seed(i - width);
    if (i < width * (height - 1)) seed(i + width);
  }

  let left = width;
  let right = 0;
  let top = height;
  let bottom = 0;
  ink.forEach((v, i) => {
    if (v === "bg") return;
    const x = i % width;
    const y = Math.floor(i / width);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  });
  const cell = (right - left + 1) / MASCOT_COLS;
  const rows = Math.ceil((bottom - top + 1) / cell);

  /** Share of each ink inside a square of `size` px at (`gx`, `gy`) cells. */
  const share = (gx: number, gy: number, size: number) => {
    const counts = { bg: 0, k: 0, r: 0, w: 0 };
    const x0 = left + gx * size;
    const y0 = top + gy * size;
    let n = 0;
    for (let y = Math.floor(y0); y < Math.floor(y0 + size); y++) {
      for (let x = Math.floor(x0); x < Math.floor(x0 + size); x++) {
        const v = x < width && y < height ? ink[y * width + x] : "bg";
        counts[v ?? "bg"]++;
        n++;
      }
    }
    return { bg: counts.bg / n, k: counts.k / n, r: counts.r / n, w: counts.w / n };
  };

  const body: string[][] = [];
  for (let gy = 0; gy < rows; gy++) {
    const row: string[] = [];
    for (let gx = 0; gx < MASCOT_COLS; gx++) {
      const s = share(gx, gy, cell);
      row.push(s.bg > 0.5 ? "." : s.k > 0.4 ? "k" : "r");
    }
    body.push(row);
  }
  // Sampling noise on the tail: drop cells with no edge-sharing neighbour.
  body.forEach((row, y) => {
    row.forEach((v, x) => {
      if (v === ".") return;
      const near = [row[x - 1], row[x + 1], body[y - 1]?.[x], body[y + 1]?.[x]];
      if (near.every((n) => n === undefined || n === ".")) row[x] = ".";
    });
  });

  const fine = cell / MASCOT_FACE_SCALE;
  const face: string[][] = [];
  for (let gy = 0; gy < rows * MASCOT_FACE_SCALE; gy++) {
    const row: string[] = [];
    for (let gx = 0; gx < MASCOT_COLS * MASCOT_FACE_SCALE; gx++) {
      row.push(share(gx, gy, fine).w > 0.45 ? "w" : ".");
    }
    face.push(row);
  }
  // Label the face: the two blobs above the lowest one are the eyes (left, right), the rest smile.
  const blobs: { cells: [number, number][]; y: number; x: number }[] = [];
  const seen = new Set<string>();
  face.forEach((row, y) => {
    row.forEach((v, x) => {
      if (v !== "w" || seen.has(`${x},${y}`)) return;
      const cells: [number, number][] = [];
      const todo: [number, number][] = [[x, y]];
      seen.add(`${x},${y}`);
      while (todo.length > 0) {
        const [cx, cy] = todo.pop() as [number, number];
        cells.push([cx, cy]);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (face[ny]?.[nx] === "w" && !seen.has(`${nx},${ny}`)) {
              seen.add(`${nx},${ny}`);
              todo.push([nx, ny]);
            }
          }
        }
      }
      let sx = 0;
      let sy = 0;
      for (const [cx, cy] of cells) {
        sx += cx;
        sy += cy;
      }
      blobs.push({ cells, x: sx / cells.length, y: sy / cells.length });
    });
  });
  const parts = blobs.filter((b) => b.cells.length >= 4);
  const smileY = Math.max(...parts.map((b) => b.y));
  const eyes = parts.filter((b) => b.y < smileY - MASCOT_FACE_SCALE).sort((a, b) => a.x - b.x);
  if (eyes.length !== 2) throw new Error(`mascot: expected 2 eyes, found ${eyes.length}`);
  for (const row of face) row.fill(".");
  for (const blob of parts) {
    const tag = blob === eyes[0] ? "L" : blob === eyes[1] ? "R" : "S";
    for (const [x, y] of blob.cells) (face[y] as string[])[x] = tag;
  }
  // Trim the face to its own box; the origin keeps it registered to the body.
  const used = parts.flatMap((b) => b.cells);
  const fx = Math.min(...used.map(([x]) => x));
  const fy = Math.min(...used.map(([, y]) => y));
  const fx1 = Math.max(...used.map(([x]) => x));
  const fy1 = Math.max(...used.map(([, y]) => y));
  const faceRows = face.slice(fy, fy1 + 1).map((row) => row.slice(fx, fx1 + 1).join(""));

  const list = (lines: string[]) => lines.map((line) => `  "${line}",`).join("\n");
  await mkdir(join(mascotOut, ".."), { recursive: true });
  await writeFile(
    mascotOut,
    [
      "// Generated by scripts/build-assets.ts from assets-src/brand/sayso-icon.png. Do not edit.",
      "",
      "/** Body cells: `k` ink outline, `r` red. One cell is one world unit. */",
      `export const MASCOT_BODY = [\n${list(body.map((row) => row.join("")))}\n] as const;`,
      "",
      "/** Face cells per body cell along each side. */",
      `export const MASCOT_FACE_SCALE = ${MASCOT_FACE_SCALE};`,
      "",
      "/** Top-left face cell, in face cells from the body grid's top-left corner. */",
      `export const MASCOT_FACE_ORIGIN = [${fx}, ${fy}] as const;`,
      "",
      "/** Face cells: `L`/`R` eyes, `S` smile. */",
      `export const MASCOT_FACE = [\n${list(faceRows)}\n] as const;`,
      "",
    ].join("\n"),
  );
}

async function voxels(): Promise<string[]> {
  await rm(voxelOut, { recursive: true, force: true });
  await mkdir(voxelOut, { recursive: true });
  const files = (await readdir(join(src, "voxels"))).filter((f) => f.endsWith(".png")).sort();
  const names: string[] = [];
  for (const file of files) {
    const name = basename(file, ".png");
    const trimmed = await sharp(join(src, "voxels", file))
      .trim()
      .toBuffer();
    for (const size of [128, 256]) {
      await sharp(trimmed)
        .resize(size, size, { fit: "contain", background: transparent })
        .webp({ quality: 82, alphaQuality: 90, effort: 6 })
        .toFile(join(voxelOut, `${name}-${size}.webp`));
    }
    names.push(name);
  }
  const list = names.map((n) => `  "${n}",`).join("\n");
  await writeFile(
    join(voxelOut, "names.ts"),
    `// Generated by scripts/build-assets.ts. Do not edit.\nexport const voxelNames = [\n${list}\n] as const;\n\nexport type VoxelName = (typeof voxelNames)[number];\n`,
  );
  return names;
}

async function brand(): Promise<void> {
  await mkdir(brandOut, { recursive: true });
  await mkdir(iconOut, { recursive: true });
  const logo = await sharp(join(src, "brand/sayso-logo-transparent.png")).trim().toBuffer();
  await sharp(logo)
    .resize({ height: 160 })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(join(brandOut, "logo.webp"));
  const mark = await sharp(join(src, "brand/sayso-icon.png")).trim().toBuffer();
  await sharp(mark)
    .resize(256, 256, { fit: "contain", background: transparent })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(join(brandOut, "mark.webp"));
  // The hero's static mascot (reduced motion, no WebGL, 3D still loading): sharp at 320 px × 2.
  await sharp(mark)
    .resize(640, 640, { fit: "contain", background: transparent })
    .webp({ quality: 88, alphaQuality: 100, effort: 6 })
    .toFile(join(brandOut, "mascot-640.webp"));

  // App icons: the mark on paper. Maskable keeps the mark inside the 80 % safe zone.
  const icon = async (size: number, inset: number, file: string) => {
    const inner = Math.round(size * (1 - 2 * inset));
    const art = await sharp(mark)
      .resize(inner, inner, { fit: "contain", background: transparent })
      .toBuffer();
    await sharp({ create: { width: size, height: size, channels: 4, background: paper } })
      .composite([{ input: art, gravity: "center" }])
      .png({ compressionLevel: 9 })
      .toFile(join(iconOut, file));
  };
  await icon(192, 0.1, "icon-192.png");
  await icon(512, 0.1, "icon-512.png");
  await icon(512, 0.2, "icon-maskable-512.png");
  await icon(180, 0.12, "apple-touch-icon.png");
}

if (process.argv.includes("--mascot")) {
  await mascot();
  console.log("mascot grid");
} else {
  const names = await voxels();
  await brand();
  await mascot();
  console.log(
    `voxels: ${names.length} x 2 sizes; brand: logo, mark, mascot; icons: 4; mascot grid`,
  );
}
