import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import type { Vec3 } from '../company-layout.ts'

/** Soft puffs that rise from a hot drink and fade out. Purely decorative. */
export function Steam({ position, count = 3, height = 0.38, size = 0.035, speed = 0.45, visible = true }: { position: Vec3; count?: number; height?: number; size?: number; speed?: number; visible?: boolean }) {
  const puffs = useRef<(THREE.Mesh | null)[]>([])
  useFrame(({ clock }) => {
    puffs.current.forEach((puff, i) => {
      if (!puff) return
      const t = (clock.elapsedTime * speed + i / count) % 1
      puff.position.set(Math.sin(t * 6 + i * 2) * 0.025, t * height, Math.cos(t * 5 + i) * 0.02)
      puff.scale.setScalar(0.6 + t * 1.4)
      ;(puff.material as THREE.MeshBasicMaterial).opacity = visible ? 0.34 * Math.sin(Math.PI * t) : 0
    })
  })
  return <group position={position}>
    {Array.from({ length: count }, (_, i) => <mesh key={i} ref={(value) => { puffs.current[i] = value }}><sphereGeometry args={[size, 8, 6]}/><meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false}/></mesh>)}
  </group>
}
