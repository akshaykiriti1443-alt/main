"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Float, Lightformer, MeshDistortMaterial, RoundedBox, Sparkles } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// The /skool hero in 3D: the seven days of the Anti-Pete Week as glass tiles orbiting one glowing
// core (the app). The ring follows the pointer, tilts as you scroll, and stops drawing when the
// hero is off screen. No network: the faces are drawn on a canvas with the page's own fonts.

const DAYS: [string, string][] = [
  ["1", "Your website, live"],
  ["2", "Two ways in"],
  ["3", "Be the stranger"],
  ["4", "Furnish the room"],
  ["5", "Five real chats"],
  ["6", "Read the numbers"],
  ["7", "Your decision"],
];

const R = 2.9;

function cssFont(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** One tile's face: DAY, a big gradient number and the day's win, on a transparent canvas.
    Light theme: ink letters on frosted glass. Dark theme: white letters on night glass. */
function drawFace(n: string, label: string, display: string, sans: string, dark: boolean) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 660;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, c.width, c.height);
  // a hairline frame with a lit top edge
  const edge = g.createLinearGradient(0, 0, 0, c.height);
  edge.addColorStop(0, dark ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.95)");
  edge.addColorStop(0.5, dark ? "rgba(255,255,255,0.08)" : "rgba(91,51,232,0.12)");
  edge.addColorStop(1, dark ? "rgba(255,255,255,0.2)" : "rgba(91,51,232,0.28)");
  g.strokeStyle = edge;
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(6, 6, c.width - 12, c.height - 12, 34);
  g.stroke();

  g.fillStyle = dark ? "rgba(255,255,255,0.62)" : "rgba(23,17,47,0.55)";
  g.font = `700 30px ${sans}`;
  g.letterSpacing = "10px";
  g.fillText("DAY", 52, 92);
  g.letterSpacing = "0px";

  const num = g.createLinearGradient(40, 140, 420, 470);
  num.addColorStop(0, dark ? "#ffffff" : "#3b1ba6");
  num.addColorStop(0.45, dark ? "#c9b8ff" : "#6a45f5");
  num.addColorStop(1, dark ? "#ff8cc1" : "#d9367f");
  g.fillStyle = num;
  g.font = `700 330px ${display}`;
  g.fillText(n, 34, 430);

  g.fillStyle = dark ? "rgba(255,255,255,0.92)" : "rgba(23,17,47,0.9)";
  g.font = `600 40px ${sans}`;
  const words = label.split(" ");
  let line = "";
  let y = 540;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > 410 && line) {
      g.fillText(line, 52, y);
      line = w;
      y += 50;
    } else line = test;
  }
  g.fillText(line, 52, y);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function Tile({ i, face, dark }: { i: number; face: THREE.Texture | null; dark: boolean }) {
  const a = (i / DAYS.length) * Math.PI * 2;
  return (
    <group position={[Math.sin(a) * R, 0, Math.cos(a) * R]} rotation={[0, a, 0]}>
      <Float speed={1.4} rotationIntensity={0.18} floatIntensity={0.35} floatingRange={[-0.08, 0.08]}>
        <RoundedBox args={[1.32, 1.7, 0.14]} radius={0.09} smoothness={5}>
          <meshPhysicalMaterial
            color={dark ? "#c4b5ff" : "#efeaff"}
            transmission={1}
            thickness={0.7}
            roughness={0.16}
            ior={1.4}
            clearcoat={1}
            clearcoatRoughness={0.1}
            attenuationColor={dark ? "#7c5cff" : "#b9a6ff"}
            attenuationDistance={dark ? 1.6 : 3}
            iridescence={0.6}
            iridescenceIOR={1.3}
            envMapIntensity={1.4}
          />
        </RoundedBox>
        {face ? (
          <mesh position={[0, 0, 0.076]}>
            <planeGeometry args={[1.28, 1.65]} />
            <meshBasicMaterial map={face} transparent toneMapped={false} depthWrite={false} />
          </mesh>
        ) : null}
      </Float>
    </group>
  );
}

function Ring({ still, dark }: { still: boolean; dark: boolean }) {
  const ring = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const [faces, setFaces] = useState<THREE.Texture[] | null>(null);
  const ptr = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const move = (e: PointerEvent) => {
      ptr.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: -((e.clientY / window.innerHeight) * 2 - 1) };
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);

  useEffect(() => {
    let live = true;
    const display = cssFont("--font-serif", "system-ui, sans-serif");
    const sans = cssFont("--font-sans", "system-ui, sans-serif");
    Promise.all([document.fonts.load(`700 120px ${display}`), document.fonts.load(`600 40px ${sans}`)])
      .catch(() => null)
      .then(() => {
        if (!live) return;
        setFaces(DAYS.map(([n, l]) => drawFace(n, l, display, sans, dark)));
      });
    return () => {
      live = false;
    };
  }, [dark]);
  useEffect(() => () => faces?.forEach((f) => f.dispose()), [faces]);

  useFrame((_, dt) => {
    if (!ring.current || !tilt.current) return;
    const s = Math.min(1.4, window.scrollY / Math.max(1, window.innerHeight));
    if (!still) ring.current.rotation.y += dt * 0.11;
    const px = still ? 0 : ptr.current.x;
    const py = still ? 0 : ptr.current.y;
    tilt.current.rotation.x = THREE.MathUtils.damp(tilt.current.rotation.x, 0.16 + py * 0.08 + s * 0.35, 3, dt);
    tilt.current.rotation.z = THREE.MathUtils.damp(tilt.current.rotation.z, -px * 0.06, 3, dt);
    tilt.current.position.y = THREE.MathUtils.damp(tilt.current.position.y, s * 0.6, 3, dt);
    camera.position.x = THREE.MathUtils.damp(camera.position.x, px * 0.7, 2.5, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, 10.5 - s * 1.2, 2.5, dt);
    camera.lookAt(0, 0, 0);
  });

  return (
    <group ref={tilt}>
      <group ref={ring}>
        {DAYS.map((_, i) => (
          <Tile key={i} i={i} face={faces?.[i] ?? null} dark={dark} />
        ))}
      </group>
      {/* The core: the app, glowing in the middle of the week. */}
      <Float speed={2} floatIntensity={0.5} rotationIntensity={0.4}>
        <mesh scale={1.05}>
          <icosahedronGeometry args={[1, 24]} />
          <MeshDistortMaterial color="#6d4dff" emissive="#4b22d6" emissiveIntensity={0.9} roughness={0.2} metalness={0.15} distort={still ? 0.2 : 0.38} speed={still ? 0 : 1.6} />
        </mesh>
      </Float>
      <mesh scale={2.6}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color="#8b6bff" transparent opacity={dark ? 0.07 : 0.05} depthWrite={false} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

export default function HeroScene({ active, still, lite, dark }: { active: boolean; still: boolean; lite: boolean; dark: boolean }) {
  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      dpr={lite ? [1, 1.25] : [1, 1.75]}
      camera={{ position: [0, 1.9, 10.5], fov: 34 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
    >
      <ambientLight intensity={dark ? 0.35 : 0.9} />
      <directionalLight position={[4, 6, 5]} intensity={1.4} color="#ffffff" />
      <pointLight position={[0, 0, 0]} intensity={30} color="#8a63ff" distance={9} />
      <pointLight position={[-5, 2, -3]} intensity={18} color="#ff6fae" distance={14} />
      <Ring still={still} dark={dark} />
      <Sparkles count={lite ? 40 : 90} scale={[13, 5, 8]} size={2.2} speed={still ? 0 : 0.35} color={dark ? "#d9ccff" : "#7c5cff"} opacity={dark ? 0.8 : 0.55} />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 4, 4]} scale={[10, 2, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={2.4} position={[-6, 0, 2]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} color="#a58bff" />
        <Lightformer form="rect" intensity={2.4} position={[6, 0, 2]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} color="#ff7fb8" />
        <Lightformer form="circle" intensity={1.5} position={[0, -4, -4]} scale={4} color="#5ee7ff" />
      </Environment>
    </Canvas>
  );
}
