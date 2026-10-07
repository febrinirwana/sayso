import type { VoxelName } from "@/assets/voxels/names";

const files = import.meta.glob<string>("../assets/voxels/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

export function voxelUrl(name: VoxelName, size: 128 | 256): string {
  const url = files[`../assets/voxels/${name}-${size}.webp`];
  if (!url) throw new Error(`voxel ${name}-${size} missing; run bun run --cwd apps/web assets`);
  return url;
}

type VoxelProps = {
  name: VoxelName;
  /** Rendered CSS size in px; the 256 px file is used above 64 px for sharp 2x displays. */
  size: number;
  className?: string;
  /** Decorative by default; pass alt only when the image carries meaning. */
  alt?: string;
};

export function Voxel({ name, size, className, alt = "" }: VoxelProps) {
  return (
    <img
      src={voxelUrl(name, size > 64 ? 256 : 128)}
      width={size}
      height={size}
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      draggable={false}
      loading="lazy"
      decoding="async"
      className={className}
    />
  );
}
