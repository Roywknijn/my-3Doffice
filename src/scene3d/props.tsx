import { useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Vec3 } from '../company-layout.ts'
import { screenTexture } from './textures.ts'

// Low-poly props built from primitives. Rounded edges and PBR materials keep them from
// looking flat; everything is procedural, so no model files are shipped.

const roundedCache = new Map<string, THREE.BufferGeometry>()
function roundedGeometry(size: Vec3, radius: number) {
  const key = `${size.join(',')}:${radius}`
  let geometry = roundedCache.get(key)
  if (!geometry) {
    geometry = new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.min(radius, ...size.map((value) => value / 2 - 0.001)))
    roundedCache.set(key, geometry)
  }
  return geometry
}

interface MaterialProps { color: string; roughness?: number; metalness?: number; emissive?: string; emissiveIntensity?: number; opacity?: number; map?: THREE.Texture }

function Material({ color, roughness = 0.7, metalness = 0, emissive, emissiveIntensity = 0.5, opacity, map }: MaterialProps) {
  return <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} emissive={emissive ?? '#000000'} emissiveIntensity={emissive ? emissiveIntensity : 0} transparent={opacity !== undefined} opacity={opacity ?? 1} map={map}/>
}

/** Rounded box. */
export function RBox({ position, size, radius = 0.04, rotation, shadow = true, ...material }: { position: Vec3; size: Vec3; radius?: number; rotation?: Vec3; shadow?: boolean } & MaterialProps) {
  return <mesh position={position} rotation={rotation} geometry={roundedGeometry(size, radius)} castShadow={shadow} receiveShadow>
    <Material {...material}/>
  </mesh>
}

export function Cyl({ position, radius, height, rotation, segments = 20, top, ...material }: { position: Vec3; radius: number; height: number; rotation?: Vec3; segments?: number; top?: number } & MaterialProps) {
  return <mesh position={position} rotation={rotation} castShadow receiveShadow>
    <cylinderGeometry args={[top ?? radius, radius, height, segments]}/>
    <Material {...material}/>
  </mesh>
}

function Group({ position = [0, 0, 0], rotation = 0, scale = 1, children }: { position?: Vec3; rotation?: number; scale?: number; children: ReactNode }) {
  return <group position={position} rotation={[0, rotation, 0]} scale={scale}>{children}</group>
}

export function OfficeChair({ position, rotation = 0, color = '#2f3a44' }: { position: Vec3; rotation?: number; color?: string }) {
  return <Group position={position} rotation={rotation}>
    <RBox position={[0, 0.48, 0]} size={[0.52, 0.09, 0.5]} radius={0.04} color={color} roughness={0.9}/>
    <RBox position={[0, 0.85, -0.23]} size={[0.5, 0.6, 0.07]} radius={0.04} color={color} roughness={0.9}/>
    <Cyl position={[0, 0.25, 0]} radius={0.035} height={0.42} color="#8b9297" metalness={0.6} roughness={0.3}/>
    {[0, 1, 2, 3, 4].map((spoke) => <RBox key={spoke} position={[Math.sin((spoke / 5) * Math.PI * 2) * 0.2, 0.05, Math.cos((spoke / 5) * Math.PI * 2) * 0.2]} rotation={[0, (spoke / 5) * Math.PI * 2, 0]} size={[0.05, 0.04, 0.42]} radius={0.015} color="#2a2f33"/>)}
  </Group>
}

export function WorkDesk({ position, active, withChair = true }: { position: Vec3; active: boolean; withChair?: boolean }) {
  const screen = useMemo(() => screenTexture(active), [active])
  return <Group position={position}>
    <RBox position={[0, 0.74, 0]} size={[1.9, 0.07, 0.95]} radius={0.03} color="#d9c3a0" roughness={0.6}/>
    <RBox position={[-0.9, 0.37, 0]} size={[0.06, 0.72, 0.85]} radius={0.02} color="#e7e2d8"/>
    <RBox position={[0.9, 0.37, 0]} size={[0.06, 0.72, 0.85]} radius={0.02} color="#e7e2d8"/>
    <RBox position={[0.55, 0.52, 0.02]} size={[0.42, 0.4, 0.8]} radius={0.02} color="#e7e2d8"/>
    {/* Monitor */}
    <RBox position={[0, 1.13, 0.22]} size={[0.86, 0.52, 0.05]} radius={0.02} color="#1c2024" roughness={0.4}/>
    <mesh position={[0, 1.13, 0.194]} rotation={[0, Math.PI, 0]}><planeGeometry args={[0.8, 0.46]}/><meshStandardMaterial map={screen} emissive={active ? '#ffffff' : '#000000'} emissiveMap={screen} emissiveIntensity={active ? 0.9 : 0} roughness={0.3}/></mesh>
    <Cyl position={[0, 0.88, 0.25]} radius={0.03} height={0.22} color="#2a2f33"/>
    <RBox position={[0, 0.785, 0.28]} size={[0.3, 0.02, 0.18]} radius={0.01} color="#2a2f33"/>
    {/* Keyboard, mouse and a mug of kopi */}
    <RBox position={[0, 0.79, -0.18]} size={[0.56, 0.025, 0.18]} radius={0.01} color="#3a4046"/>
    <RBox position={[0.42, 0.79, -0.18]} size={[0.07, 0.03, 0.11]} radius={0.02} color="#3a4046"/>
    <Cyl position={[-0.65, 0.84, -0.1]} radius={0.05} height={0.12} color="#f4efe6"/>
    <Cyl position={[-0.65, 0.901, -0.1]} radius={0.043} height={0.005} color="#3b2415"/>
    {withChair && <OfficeChair position={[0, 0, -0.78]}/>}
  </Group>
}

export function Sofa({ position, rotation = 0, color = '#5b6f8c' }: { position: Vec3; rotation?: number; color?: string }) {
  return <Group position={position} rotation={rotation}>
    <RBox position={[0, 0.28, 0]} size={[2.4, 0.36, 0.9]} radius={0.1} color={color} roughness={0.95}/>
    <RBox position={[0, 0.66, -0.36]} size={[2.4, 0.62, 0.2]} radius={0.1} color={color} roughness={0.95}/>
    <RBox position={[-1.12, 0.52, 0]} size={[0.2, 0.42, 0.9]} radius={0.08} color={color} roughness={0.95}/>
    <RBox position={[1.12, 0.52, 0]} size={[0.2, 0.42, 0.9]} radius={0.08} color={color} roughness={0.95}/>
    {[-0.5, 0.5].map((x) => <RBox key={x} position={[x, 0.5, 0.05]} size={[0.95, 0.14, 0.7]} radius={0.07} color="#6e83a2" roughness={0.95}/>)}
    <RBox position={[-0.7, 0.72, -0.18]} size={[0.38, 0.34, 0.14]} radius={0.07} color="#e0a43a" roughness={0.95}/>
  </Group>
}

export function Armchair({ position, rotation = 0, color }: { position: Vec3; rotation?: number; color: string }) {
  return <Group position={position} rotation={rotation}>
    <RBox position={[0, 0.3, 0]} size={[0.9, 0.4, 0.85]} radius={0.12} color={color} roughness={0.95}/>
    <RBox position={[0, 0.66, -0.34]} size={[0.9, 0.52, 0.18]} radius={0.08} color={color} roughness={0.95}/>
  </Group>
}

export function Plant({ position, size = 1 }: { position: Vec3; size?: number }) {
  return <Group position={position} scale={size}>
    <Cyl position={[0, 0.22, 0]} radius={0.2} top={0.26} height={0.44} color="#b0643a" roughness={0.8}/>
    {[[0, 0.75, 0, 0.32], [0.14, 0.95, 0.05, 0.22], [-0.12, 0.92, -0.06, 0.24], [0, 1.12, 0, 0.18]].map(([x, y, z, r]) => <mesh key={`${x}${y}`} position={[x, y, z]} castShadow><icosahedronGeometry args={[r, 1]}/><meshStandardMaterial color="#4f8a4a" roughness={0.85} flatShading/></mesh>)}
  </Group>
}

export function Bookshelf({ position, rotation = 0 }: { position: Vec3; rotation?: number }) {
  const books = useMemo(() => Array.from({ length: 18 }, (_, index) => ({ color: ['#b54b45', '#2f6f8f', '#e0a43a', '#4f8a4a', '#6a4d8d', '#dcd6c8'][index % 6], height: 0.26 + ((index * 7) % 5) * 0.03 })), [])
  return <Group position={position} rotation={rotation}>
    <RBox position={[0, 1, 0]} size={[1.4, 2, 0.4]} radius={0.02} color="#6b4a32"/>
    {[0.35, 0.95, 1.55].map((y, shelf) => books.slice(shelf * 6, shelf * 6 + 6).map((book, index) => <RBox key={`${shelf}-${index}`} position={[-0.5 + index * 0.2, y + book.height / 2, 0.08]} size={[0.14, book.height, 0.26]} radius={0.01} color={book.color}/>))}
  </Group>
}

export function WallClock({ position }: { position: Vec3 }) {
  return <Group position={position}>
    <Cyl position={[0, 0, 0]} radius={0.3} height={0.05} rotation={[Math.PI / 2, 0, 0]} color="#f4efe6" segments={28}/>
    <RBox position={[0, 0.07, 0.035]} size={[0.03, 0.18, 0.01]} radius={0.004} color="#1c2024"/>
    <RBox position={[0.06, 0, 0.035]} size={[0.14, 0.025, 0.01]} radius={0.004} color="#1c2024"/>
  </Group>
}

export function Tree({ position, size = 1 }: { position: Vec3; size?: number }) {
  return <Group position={position} scale={size}>
    <Cyl position={[0, 0.9, 0]} radius={0.16} top={0.12} height={1.8} color="#6b4a32" roughness={0.9}/>
    {[[0, 2.2, 0, 1], [0.5, 1.9, 0.2, 0.7], [-0.45, 2.0, -0.2, 0.75], [0.1, 2.7, 0.1, 0.7]].map(([x, y, z, r]) => <mesh key={`${x}${y}`} position={[x, y, z]} castShadow><icosahedronGeometry args={[r, 1]}/><meshStandardMaterial color="#3f7a3c" roughness={0.9} flatShading/></mesh>)}
  </Group>
}
