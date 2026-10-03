import { useFrame } from '@react-three/fiber'
import { forwardRef, useRef } from 'react'
import * as THREE from 'three'
import { billiardShot } from '../idle-activities.ts'

export const CoffeeMug = forwardRef<THREE.Group>(function CoffeeMug(_, ref) {
  return <group ref={ref} visible={false}>
    <mesh castShadow><cylinderGeometry args={[0.095, 0.075, 0.16, 16]}/><meshStandardMaterial color="#faf2dc" roughness={0.35}/></mesh>
    <mesh position={[0, 0.081, 0]}><cylinderGeometry args={[0.077, 0.077, 0.004, 16]}/><meshStandardMaterial color="#492713"/></mesh>
    <mesh position={[0.1, 0, 0]}><torusGeometry args={[0.057, 0.016, 8, 16]}/><meshStandardMaterial color="#faf2dc"/></mesh>
  </group>
})

export function BilliardBalls({ x, players }: { x: number; players: { slot: number; arrivedAt: number }[] }) {
  const balls = useRef<(THREE.Mesh | null)[]>([])
  useFrame(() => {
    const shot = billiardShot(Date.now(), players)
    // A stylized shot, collision and rebound on the felt (not a physics simulation).
    const t = Math.max(0, shot.phase - 2.75)
    const travel = shot.slot < 0 ? 0 : Math.min(t / 1.5, 1)
    const direction = shot.slot === 1 ? -1 : 1
    balls.current.forEach((ball, i) => {
      if (!ball) return
      const home = i === 0 ? -1.32 : 0.1 + (i % 2) * 0.19
      const move = i === 0 ? travel * 1.38 : Math.max(0, travel - 0.48) * (i % 2 ? 1.6 : 0.8)
      ball.position.set(x + 3.4 + direction * (home + move), 1.025, 5.25 + (i === 0 ? 0 : (i - 2.5) * 0.22 + Math.sin(travel * Math.PI) * (i % 2 ? 0.22 : -0.22)))
      ball.rotation.z = direction * travel * 18
    })
  })
  return <>{['#faf7ed', '#be3830', '#e8b12d', '#345393', '#252524'].map((color, i) => <mesh key={color} ref={(value) => { balls.current[i] = value }} castShadow><sphereGeometry args={[0.065, 12, 8]}/><meshStandardMaterial color={color} roughness={0.3}/></mesh>)}</>
}

export function LoungeTV({ x }: { x: number }) {
  const scene = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (scene.current) scene.current.position.x = Math.sin(clock.elapsedTime * 0.35) * 0.45 })
  return <group position={[x + 3.2, 1.55, -0.965]}>
    <mesh><planeGeometry args={[2.33, 1.22]}/><meshBasicMaterial color="#8bbacf"/></mesh>
    <mesh position={[0, -0.38, 0.003]}><planeGeometry args={[2.33, 0.46]}/><meshBasicMaterial color="#72976b"/></mesh>
    <mesh position={[0.75, 0.35, 0.004]}><circleGeometry args={[0.13, 24]}/><meshBasicMaterial color="#ffe4a1"/></mesh>
    <group ref={scene} position={[0, 0, 0.006]}>
      <mesh position={[-0.45, -0.18, 0]}><circleGeometry args={[0.27, 3]}/><meshBasicMaterial color="#487b70"/></mesh>
      <mesh position={[0.28, 0.3, 0]} scale={[1, 0.24, 1]}><circleGeometry args={[0.23, 20]}/><meshBasicMaterial color="#f3f2dd"/></mesh>
    </group>
  </group>
}
