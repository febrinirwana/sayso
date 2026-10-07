import type { ThreeElements } from "@react-three/fiber";
import {
  type ForwardRefExoticComponent,
  forwardRef,
  type RefAttributes,
  useLayoutEffect,
  useRef,
} from "react";
import {
  type BufferGeometry,
  type Group,
  type InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
} from "three";
import { RoundedBoxGeometry } from "three-stdlib";

/** One colour of a voxel grid. `depth` above 1 pops the cell out of both faces (eyes, stamps). */
export type VoxelPart = { color: string; depth?: number };

export type VoxelMeshProps = ThreeElements["group"];

export type VoxelMesh = ForwardRefExoticComponent<VoxelMeshProps & RefAttributes<Group>> & {
  /** Largest grid side in cells; one cell is one world unit before scaling. */
  readonly span: number;
};

/** Every grid is two cells thick, centred on z = 0 so pieces turn about their middle. */
const LAYERS = [0.5, -0.5] as const;
const POP = 0.15;

// Geometries and materials are shared by every voxel on every canvas: never dispose them.
const geometries = new Map<number, BufferGeometry>();
const materials = new Map<string, MeshStandardMaterial>();

function geometry(depth: number): BufferGeometry {
  let geo = geometries.get(depth);
  if (!geo) {
    // One corner segment: at a 0.03 radius it reads the same as more, at a third of the triangles.
    geo = new RoundedBoxGeometry(1, 1, depth, 1, 0.03);
    geometries.set(depth, geo);
  }
  return geo;
}

function material(color: string): MeshStandardMaterial {
  let mat = materials.get(color);
  if (!mat) {
    mat = new MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });
    materials.set(color, mat);
  }
  return mat;
}

type Batch = {
  key: string;
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  count: number;
  /** Column-major 4×4 instance matrices, ready to copy into `instanceMatrix`. */
  matrices: Float32Array;
};

/**
 * Builds a voxel mesh from a pixel grid: one string per row, one character per cell, `.` empty.
 * Each character maps to a part; cells are batched into one `InstancedMesh` per part.
 */
export function defineVoxel(
  displayName: string,
  rows: readonly string[],
  parts: Readonly<Record<string, VoxelPart>>,
): VoxelMesh {
  const cols = Math.max(...rows.map((row) => row.length));
  const cells = new Map<string, number[]>();
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const key = row.charAt(c);
      if (key === ".") continue;
      if (!parts[key]) throw new Error(`${displayName}: no part for "${key}"`);
      const xs = cells.get(key) ?? [];
      xs.push(c - (cols - 1) / 2, (rows.length - 1) / 2 - r);
      cells.set(key, xs);
    }
  });

  const m = new Matrix4();
  const batches: Batch[] = [...cells].map(([key, xy]) => {
    const part = parts[key] as VoxelPart;
    const depth = part.depth ?? 1;
    const pop = depth > 1 ? POP : 0;
    const count = (xy.length / 2) * LAYERS.length;
    const matrices = new Float32Array(count * 16);
    let i = 0;
    for (let p = 0; p < xy.length; p += 2) {
      for (const z of LAYERS) {
        m.makeTranslation(xy[p] ?? 0, xy[p + 1] ?? 0, z + Math.sign(z) * pop);
        m.toArray(matrices, i * 16);
        i++;
      }
    }
    return { key, geometry: geometry(depth), material: material(part.color), count, matrices };
  });

  const Mesh = forwardRef<Group, VoxelMeshProps>(function Voxel(props, ref) {
    return (
      <group ref={ref} {...props}>
        {batches.map((batch) => (
          <BatchMesh key={batch.key} batch={batch} />
        ))}
      </group>
    );
  });
  Mesh.displayName = displayName;
  return Object.assign(Mesh, { span: Math.max(cols, rows.length) });
}

function BatchMesh({ batch }: { batch: Batch }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.instanceMatrix.array.set(batch.matrices);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [batch]);
  return <instancedMesh ref={ref} args={[batch.geometry, batch.material, batch.count]} />;
}
