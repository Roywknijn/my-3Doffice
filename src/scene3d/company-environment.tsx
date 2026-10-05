import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { CompanyLayout, Vec3 } from '../company-layout.ts'
import { currentHour, dayCycle } from '../day-cycle.ts'
import type { Task } from '../types.ts'
import { Armchair, Bookshelf, Cyl, OfficeChair, Plant, RBox, Sofa, Tree, WallClock } from './props.tsx'
import { BilliardBalls, LoungeTV } from './idle-props.tsx'
import { kanbanTexture, officeSignTexture, parquetTexture, skylineTexture } from './company-textures.ts'

function Sign({ text, position, width = 2.5 }: { text: string; position: Vec3; width?: number }) {
  const map = useMemo(() => officeSignTexture(text), [text])
  useEffect(() => () => map.dispose(), [map])
  return <mesh position={position}><planeGeometry args={[width, width / 8]}/><meshBasicMaterial map={map}/></mesh>
}

const NIGHT_VIEW = new THREE.Color('#4b5c85')
const DUSK_VIEW = new THREE.Color('#ffc9a0')
const WHITE = new THREE.Color('#ffffff')

export function CompanyEnvironment({ layout, tasks, available, partial, onOpenBoard, poolPlayers }: { layout: CompanyLayout; tasks: Task[]; available: boolean; partial: boolean; onOpenBoard: () => void; poolPlayers: { slot: number; arrivedAt: number }[] }) {
  const { bounds: b, loungeX: lx, table } = layout
  const width = b.maxX - b.minX; const depth = b.maxZ - b.minZ
  const floor = useMemo(() => { const t = parquetTexture(); t.repeat.set(width / 5, depth / 5); return t }, [width, depth])
  const skyline = useMemo(skylineTexture, [])
  const view = useRef<THREE.MeshBasicMaterial>(null)
  // The city outside follows the real time of day (see day-cycle.ts).
  useFrame(() => {
    const { daylight, warmth } = dayCycle(currentHour())
    view.current?.color.lerpColors(NIGHT_VIEW, WHITE, daylight).lerp(DUSK_VIEW, warmth * 0.45)
  })
  const taskKey = JSON.stringify(tasks.map(({ title, status, assignee }) => ({ title, status, assignee })))
  // Use content rather than polling object identity to avoid rebuilding the board every poll.
  const board = useMemo(() => kanbanTexture(JSON.parse(taskKey) as Task[], available, partial), [taskKey, available, partial])
  useEffect(() => () => floor.dispose(), [floor])
  useEffect(() => () => skyline.dispose(), [skyline])
  useEffect(() => () => board.dispose(), [board])
  return <group>
    <RBox position={[(b.minX + b.maxX) / 2, -0.18, (b.minZ + b.maxZ) / 2]} size={[width + 0.2, 0.35, depth + 0.2]} radius={0.03} color="#b79766"/>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(b.minX + b.maxX) / 2, 0.005, (b.minZ + b.maxZ) / 2]} receiveShadow><planeGeometry args={[width, depth]}/><meshStandardMaterial map={floor} roughness={0.8}/></mesh>
    {/* Cutaway shell: no front wall or roof to hide the people. */}
    <RBox position={[(b.minX + b.maxX) / 2, 1.9, b.minZ]} size={[width, 3.8, 0.15]} color="#c9bba6"/>
    <RBox position={[b.minX, 1.9, (b.minZ + b.maxZ) / 2]} size={[0.15, 3.8, depth]} color="#ddd2bd"/>
    <RBox position={[b.maxX, 1.4, (b.minZ + b.maxZ) / 2]} size={[0.15, 2.8, depth]} color="#d3c7b3"/>
    {/* City windows behind the workspace / private manager rooms. */}
    <mesh position={[(lx - 1) / 2, 2, b.minZ + 0.09]}><planeGeometry args={[lx - 1, 3.35]}/><meshBasicMaterial ref={view} map={skyline}/></mesh>
    {Array.from({ length: Math.ceil((lx - 1) / 1.5) + 1 }, (_, i) => <RBox key={i} position={[i * (lx - 1) / Math.ceil((lx - 1) / 1.5), 2, b.minZ + 0.13]} size={[0.05, 3.4, 0.05]} color="#344944"/>)}
    {[0.34, 3.7].map((y) => <RBox key={y} position={[(lx - 1) / 2, y, b.minZ + 0.13]} size={[lx - 1, 0.06, 0.06]} color="#344944"/>)}
    {/* Glass partitions and explicit door openings share geometry with pathfinding. */}
    {layout.walls.map((wall, i) => {
      const w = wall.maxX - wall.minX; const d = wall.maxZ - wall.minZ
      const x = (wall.minX + wall.maxX) / 2; const z = (wall.minZ + wall.maxZ) / 2
      return <group key={i}>
        <mesh position={[x, 1.48, z]}><boxGeometry args={[w, 2.92, d]}/><meshStandardMaterial color="#b1d3ce" transparent opacity={0.09} roughness={0.2} depthWrite={false}/></mesh>
        {[0.08, 2.95].map((y) => <RBox key={y} position={[x, y, z]} size={[w, 0.045, d]} color="#3b423a"/>)}
        {[-1, 1].map((end) => <RBox key={end} position={[x + (w > d ? end * (w / 2 - 0.025) : 0), 1.5, z + (d > w ? end * (d / 2 - 0.025) : 0)]} size={[0.045, 3, 0.045]} color="#3b423a"/>)}
      </group>
    })}
    {layout.rooms.filter((r) => r.id !== 'meeting').map((room) => <group key={room.id}>
      <Sign text={room.id === 'ceo' ? 'CEO / DEFAULT' : `MANAGER / ${room.owner}`} position={[(room.minX + room.maxX) / 2, 3.3, room.id === 'ceo' ? room.minZ + 0.08 : room.maxZ + 0.08]} width={Math.min(4, room.maxX - room.minX - 0.5)}/>
      <Plant position={[room.minX + 0.65, 0, room.minZ + 0.75]} size={0.8}/>
      {room.id !== 'ceo' && <Bookshelf position={[room.maxX - 0.8, 0, room.minZ + 0.3]}/>}
    </group>)}
    {/* CEO guest seating, warm rug and bookshelf. */}
    <RBox position={[-4.5, 0.02, 5]} size={[5.2, 0.025, 4.2]} color="#ece8da" shadow={false}/>
    <Armchair position={[-5.7, 0, 6.4]} rotation={Math.PI} color="#956231"/>
    <Armchair position={[-3.3, 0, 6.4]} rotation={Math.PI} color="#956231"/>
    <Bookshelf position={[-7.4, 0, 3.5]} rotation={Math.PI / 2}/>
    {/* Board mounted on the rear meeting-room wall. */}
    <Sign text="RUANG RAPAT" position={[-4.5, 3.45, b.minZ + 0.12]} width={3}/>
    <RBox position={[-4.5, 2, b.minZ + 0.12]} size={[5.6, 2.85, 0.08]} color="#e4e2d9"/>
    <mesh position={[-4.5, 2, b.minZ + 0.171]} onClick={(e) => { e.stopPropagation(); onOpenBoard() }}><planeGeometry args={[5.4, 2.7]}/><meshBasicMaterial map={board}/></mesh>
    <RBox position={[table.center[0], 0.78, table.center[2]]} size={[2, 0.12, table.length]} radius={0.13} color="#ad8659"/>
    {[-1, 1].map((side) => <RBox key={side} position={[table.center[0], 0.38, table.center[2] + side * (table.length / 2 - 0.5)]} size={[1.3, 0.76, 0.15]} color="#3c493f"/>)}
    {layout.meetingSeats.map((seat, i) => <group key={i}><OfficeChair position={seat.position} rotation={seat.facing} color="#dedacb"/><RBox position={[-4.5 + (i % 2 ? 0.64 : -0.64), 0.855, seat.position[2]]} size={[0.32, 0.02, 0.25]} color="#f3f1df"/></group>)}
    {/* Coffee bar and lounge, inspired by the reference's right wing. */}
    <Sign text="MYCOMPANY / COFFEE & IDEAS" position={[lx + 3.6, 3.25, b.minZ + 0.12]} width={5}/>
    <WallClock position={[lx + 0.6, 2.7, b.minZ + 0.13]}/>
    <RBox position={[lx + 3.5, 0.66, b.minZ + 1]} size={[5.6, 1.3, 0.9]} color="#967345"/>
    <RBox position={[lx + 3.5, 1.35, b.minZ + 1]} size={[5.9, 0.12, 1.1]} color="#e2d1b8"/>
    <RBox position={[lx + 1.3, 1.64, b.minZ + 1]} size={[0.7, 0.55, 0.6]} color="#313c35"/>
    <RBox position={[lx + 5.8, 1.64, b.minZ + 1]} size={[0.65, 0.55, 0.6]} color="#313c35"/>
    {[1.3, 5.8].map((dx) => <group key={dx}><RBox position={[lx + dx, 1.64, b.minZ + 1.32]} size={[0.4, 0.23, 0.08]} color="#bac8c3"/><Cyl position={[lx + dx, 1.48, b.minZ + 1.43]} radius={0.035} height={0.12} color="#303c36"/></group>)}
    {[2.7, 3.8, 4.9].map((dx) => <group key={dx}><Cyl position={[lx + dx, 0.76, b.minZ + 2.2]} radius={0.28} height={0.12} color="#a67a36"/><Cyl position={[lx + dx, 0.38, b.minZ + 2.2]} radius={0.035} height={0.7} color="#344238"/><Cyl position={[lx + dx, 0.05, b.minZ + 2.2]} radius={0.23} height={0.05} color="#344238"/></group>)}
    {[1.9, 2.6].map((y) => <RBox key={y} position={[lx + 3.9, y, b.minZ + 0.28]} size={[4.5, 0.06, 0.45]} color="#967345"/>)}
    <Plant position={[lx + 6.6, 0, b.minZ + 1.4]} size={1.1}/>
    <RBox position={[lx + 3.3, 0.02, 1.1]} size={[5.6, 0.025, 3.5]} color="#eee8d9" shadow={false}/>
    {/* A slatted divider behind the television. */}
    {Array.from({ length: 27 }, (_, i) => <RBox key={i} position={[lx + 0.6 + i * 0.2, 1.3, -1.2]} size={[0.045, 2.6, 0.13]} color="#8e6a3e"/>)}
    <RBox position={[lx + 3.2, 1.55, -1.03]} size={[2.5, 1.36, 0.1]} color="#202c29"/>
    <LoungeTV x={lx}/>
    <Sofa position={[lx + 3, 0, 2.2]} rotation={Math.PI} color="#285f4c"/>
    <RBox position={[lx + 3, 0.42, 1.0]} size={[1.85, 0.06, 1.15]} color="#98764d"/>
    {[-1, 1].map((side) => <RBox key={side} position={[lx + 3 + side * 0.7, 0.21, 1]} size={[0.06, 0.42, 0.9]} color="#34453b"/>)}
    {[1.65, 4.65].map((dx) => <group key={dx}><Cyl position={[lx + dx, 0.42, 1.05]} radius={0.23} height={0.06} color="#98764d"/><Cyl position={[lx + dx, 0.2, 1.05]} radius={0.04} height={0.4} color="#34453b"/></group>)}
    <Armchair position={[lx + 0.8, 0, 1.2]} rotation={Math.PI / 2} color="#a47639"/>
    <Armchair position={[lx + 5.5, 0, 1.2]} rotation={-Math.PI / 2} color="#a47639"/>
    {/* Pool table. */}
    <RBox position={[lx + 3.4, 0.82, 5.25]} size={[3.8, 0.23, 2.1]} color="#795731"/>
    <RBox position={[lx + 3.4, 0.95, 5.25]} size={[3.48, 0.02, 1.8]} color="#287459"/>
    {[-1, 1].flatMap((x) => [-1, 1].map((z) => <RBox key={`${x}${z}`} position={[lx + 3.4 + x * 1.5, 0.4, 5.25 + z * 0.7]} size={[0.17, 0.8, 0.17]} color="#65462c"/>))}
    <BilliardBalls x={lx} players={poolPlayers}/>
    {/* Central green island. */}
    <Cyl position={[5.9, 0.15, 6.6]} radius={1} height={0.3} color="#a17843"/>
    <Cyl position={[5.9, 0.43, 6.6]} radius={0.62} height={0.55} color="#e2dac6"/>
    <Tree position={[5.9, 0.5, 6.6]} size={0.9}/>
    <Plant position={[-0.15, 0, 7.2]} size={1.1}/>
    <Plant position={[lx + 6.5, 0, 7]} size={1.2}/>
  </group>
}
