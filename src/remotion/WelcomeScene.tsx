"use client";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
export const WELCOME_FRAMES = 126;
export const WELCOME_FPS = 30;
/** A frame-driven 3D quote assembling from a site note. */
export function WelcomeScene({ onReady }: { onReady?: () => void }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 22, stiffness: 95 } });
  const turn = interpolate(frame, [0, 70, 126], [-0.65, 0.15, 0.22], { extrapolateRight: "clamp" });
  return <AbsoluteFill data-testid="welcome-scene" data-frame={frame} style={{ background: "transparent" }}>
    <ThreeCanvas onCreated={onReady} width={width} height={height} camera={{ position: [0, 0, 7.8], fov: 37 }} gl={{ alpha: true, antialias: true }} dpr={1.5}>
      <ambientLight intensity={1.5} />
      <directionalLight position={[-3, 5, 6]} intensity={4} color="#fff2dc" />
      <pointLight position={[4, 1, 3]} intensity={40} color="#ff641a" />
      <pointLight position={[-4, -2, 3]} intensity={18} color="#bbcfff" />
      <group position={[0, (1 - enter) * -0.8, 0]} rotation={[0.08, turn, -0.07]} scale={0.85 + enter * 0.15}>
        <mesh position={[-0.18, -0.1, -0.17]} rotation={[0, 0, -0.08]}><boxGeometry args={[2.55, 3.25, 0.08]} /><meshStandardMaterial color="#7a441f" metalness={0.45} roughness={0.32} /></mesh>
        <mesh><boxGeometry args={[2.55, 3.25, 0.14]} /><meshStandardMaterial color="#252a2b" metalness={0.45} roughness={0.28} /></mesh>
        <mesh position={[-0.79, 1.17, 0.12]}><boxGeometry args={[0.44, 0.13, 0.08]} /><meshStandardMaterial color="#ff651b" emissive="#ff651b" emissiveIntensity={0.3} /></mesh>
        {[0, 1, 2, 3].map((i) => {
          const reveal = spring({ frame: frame - 14 - i * 7, fps, config: { damping: 22 } });
          return <group key={i} position={[0, 0.61 - i * 0.44, 0.12]} scale={[Math.max(0.001, reveal), 1, 1]}>
            <mesh position={[-0.32, 0, 0]}><boxGeometry args={[1.35 - i * 0.08, 0.075, 0.025]} /><meshStandardMaterial color="#e9e4d9" /></mesh>
            <mesh position={[0.81, 0, 0]}><boxGeometry args={[0.32, 0.075, 0.025]} /><meshStandardMaterial color="#b6b9b4" /></mesh>
          </group>;
        })}
        <mesh position={[0, -1.19, 0.13]} scale={[Math.max(0.001, spring({ frame: frame - 48, fps, config: { damping: 22 } })), 1, 1]}><boxGeometry args={[2.03, 0.31, 0.04]} /><meshStandardMaterial color="#ff651b" roughness={0.38} /></mesh>
      </group>
      <group position={[1.55, -0.9, 0.7]} rotation={[Math.PI / 2, -0.2, 0.05]} scale={Math.max(0.001, spring({ frame: frame - 65, fps, config: { damping: 20 } }))}>
        <mesh><cylinderGeometry args={[0.4, 0.4, 0.12, 48]} /><meshStandardMaterial color="#ff651b" metalness={0.25} roughness={0.28} /></mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.5, 0.018, 12, 64]} /><meshStandardMaterial color="#ffd4ad" /></mesh>
      </group>
    </ThreeCanvas>
  </AbsoluteFill>;
}
