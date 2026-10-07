/** DESIGN section 7 rig: soft ambient, two symmetric key lights from above, one fill from below. */
export function VoxelLights() {
  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[6, 8, 5]} intensity={2} />
      <directionalLight position={[-6, 8, 5]} intensity={2} />
      <directionalLight position={[0, -5, 4]} intensity={1} />
    </>
  );
}
