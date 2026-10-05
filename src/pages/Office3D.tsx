import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { officeStateBadge } from '../office-state.ts'
import { agentLook } from '../agents.ts'
import { currentHour, dayCycle } from '../day-cycle.ts'
import { clampTarget, companyLayout, companyPlacements, deskPlacement, officeRole, subagentPlacements, subagentStart, type CompanyLayout, type CompanyPlacement, type Vec3 } from '../company-layout.ts'
import { activityWalkPath, billiardShot, IdleDirector, sipMotion } from '../idle-activities.ts'
import { CoffeeMug } from '../scene3d/idle-props.tsx'
import { CompanyEnvironment } from '../scene3d/company-environment.tsx'
import { RBox, WorkDesk } from '../scene3d/props.tsx'
import type { OfficeInteraction, OfficeStation, OfficeSubagent, TaskBoardSnapshot } from '../types.ts'
import { usePolling } from '../polling.ts'

// 3D view of the same Office snapshot the 2D view renders. Positions come from each station's
// room, roomPosition and seat, so the 3D office shows exactly the states the server derived.

type Registry<T> = MutableRefObject<Map<string, T>>

function Character({ station, placement, layout, onSelect, anchor, arrivals, poolPlayers, look = station.id, scale = 1, start: startAt }: { station: OfficeStation; placement: CompanyPlacement; layout: CompanyLayout; onSelect?: (station: OfficeStation, trigger: HTMLElement | null) => void; anchor: (object: THREE.Object3D | null) => void; arrivals: Registry<string>; poolPlayers: { slot: number; arrivedAt: number }[]; look?: string; scale?: number; start?: Vec3 }) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const leftLeg = useRef<THREE.Mesh>(null)
  const rightLeg = useRef<THREE.Mesh>(null)
  const leftArm = useRef<THREE.Mesh>(null)
  const rightArm = useRef<THREE.Mesh>(null)
  const head = useRef<THREE.Group>(null)
  const mug = useRef<THREE.Group>(null)
  const cue = useRef<THREE.Group>(null)
  const leftEye = useRef<THREE.Group>(null)
  const rightEye = useRef<THREE.Group>(null)
  const dots = useRef<THREE.Group>(null)
  const pop = useRef<THREE.Group>(null)
  const popRing = useRef<THREE.Mesh>(null)
  const popSparks = useRef<THREE.Group>(null)
  const dust = useRef<THREE.Group>(null)
  const sit = useRef(0)
  const speed = useRef(0)
  const lastStep = useRef(0)
  const nextPuff = useRef(0)
  const puffAge = useRef([9, 9, 9, 9])
  const waveUntil = useRef(0)
  const waved = useRef(new Map<string, number>())
  const prevState = useRef(station.state)
  const popAt = useRef(-9)
  // Desynchronizes blinking, glances and stretches between agents.
  const phase = useMemo(() => [...station.id].reduce((sum, char) => sum + char.charCodeAt(0) * 7, 0) % 628 / 100, [station.id])
  const approach = useRef<Vec3 | undefined>(undefined)
  const cupTarget = useMemo(() => new THREE.Vector3(), [])
  const armTarget = useMemo(() => new THREE.Vector3(), [])
  const colors = agentLook(look)
  const offline = station.state === 'Offline'
  const unknown = station.state === 'Unknown'
  const tint = (color: string) => offline ? '#7b7f7d' : color
  // Only the first placement is applied as a prop; later changes are walked to via the aisle.
  const [start] = useState<Vec3>(() => startAt ?? deskPlacement(station.id, layout).position)
  const path = useRef<THREE.Vector3[]>([])
  const destination = placement.position.join(',')
  useEffect(() => {
    const group = root.current
    if (!group) return
    path.current = activityWalkPath([group.position.x, 0, group.position.z], approach.current, placement, layout).map((p) => new THREE.Vector3(...p))
    approach.current = placement.approach
    // placement.position is captured through `destination`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, layout])

  useEffect(() => {
    const group = root.current
    if (group) crowd.set(station.id, group)
    return () => { crowd.delete(station.id) }
  }, [station.id])

  useFrame((state, delta) => {
    const group = root.current
    if (!group) return
    const time = state.clock.elapsedTime
    const now = Date.now()
    const idle = placement.idle
    const next = path.current[0]
    let walking = false
    if (next) {
      const toNext = next.clone().sub(group.position)
      toNext.y = 0
      const distance = toNext.length()
      if (distance < 0.04) {
        group.position.copy(next)
        path.current.shift()
      } else {
        walking = true
        // Ease in from rest and slow for the last stretch of the route.
        speed.current = THREE.MathUtils.damp(speed.current, path.current.length <= 1 && distance < 0.6 ? 1.1 : 2.6, 6, delta)
        group.position.add(toNext.normalize().multiplyScalar(Math.min(distance, Math.max(speed.current, 0.5) * delta)))
        const heading = Math.atan2(toNext.x, toNext.z)
        group.rotation.y += Math.atan2(Math.sin(heading - group.rotation.y), Math.cos(heading - group.rotation.y)) * 0.25
      }
    }
    walking = walking || path.current.length > 0
    if (!walking) speed.current = THREE.MathUtils.damp(speed.current, 0, 10, delta)
    const arrived = !walking && Math.hypot(group.position.x - placement.position[0], group.position.z - placement.position[2]) < 0.08
    if (idle && arrived) arrivals.current.set(station.id, idle.token)
    else arrivals.current.delete(station.id)
    const elapsed = idle?.arrivedAt === undefined ? 0 : Math.max(0, (now - idle.arrivedAt) / 1000)
    const lounge = arrived && idle?.action === 'lounge'
    const brewing = arrived && idle?.action === 'coffee'
    const billiards = arrived && idle?.action === 'billiards'
    const shot = billiardShot(now, poolPlayers)
    const shooting = billiards && shot.slot === idle.slot
    if (!walking) group.rotation.y += Math.atan2(Math.sin(placement.facing - group.rotation.y), Math.cos(placement.facing - group.rotation.y)) * 0.12
    const stride = walking ? Math.max(0.35, Math.min(1, speed.current / 2.6)) : 0
    const swing = Math.sin(time * 10) * 0.6 * stride
    const seated = arrived && placement.seated
    sit.current = THREE.MathUtils.damp(sit.current, seated ? 1 : 0, 9, delta)
    const working = station.state === 'Working' || station.state === 'Reviewing'
    const typing = !walking && placement.intent === 'desk' && working
    const resting = arrived && station.state === 'Idle' && !lounge && !brewing && !billiards
    const stretchTime = (time + phase * 3) % 24
    const stretch = resting && stretchTime < 2.6 ? Math.sin((stretchTime / 2.6) * Math.PI) : 0
    if (walking && time > waveUntil.current) {
      const fx = Math.sin(group.rotation.y); const fz = Math.cos(group.rotation.y)
      for (const [id, other] of crowd) {
        if (id === station.id || time - (waved.current.get(id) ?? -99) < 25) continue
        const dx = other.position.x - group.position.x; const dz = other.position.z - group.position.z
        const distance = Math.hypot(dx, dz)
        if (distance > 0.3 && distance < 1.7 && (dx * fx + dz * fz) / distance > 0.5) { waveUntil.current = time + 1.4; waved.current.set(id, time); break }
      }
    }
    const waving = time < waveUntil.current
    if (leftLeg.current && rightLeg.current) {
      leftLeg.current.rotation.x = THREE.MathUtils.lerp(swing, -Math.PI / 2.2, sit.current)
      rightLeg.current.rotation.x = THREE.MathUtils.lerp(-swing, -Math.PI / 2.2, sit.current)
    }
    if (leftArm.current && rightArm.current) {
      leftArm.current.scale.y = rightArm.current.scale.y = 1
      const talking = !walking && (placement.intent === 'handoff' || placement.intent === 'meeting' || station.state === 'Collaborating' || (lounge && !!idle.peer && elapsed % 10 < 5))
      leftArm.current.rotation.set(0, 0, 0); rightArm.current.rotation.set(0, 0, 0)
      leftArm.current.rotation.x = walking ? -swing : typing ? -1.1 + Math.sin(time * 14) * 0.12 : talking ? -0.4 + Math.sin(time * 3) * 0.3 : 0
      rightArm.current.rotation.x = walking ? swing : typing ? -1.1 + Math.cos(time * 14) * 0.12 : 0
      if (brewing) leftArm.current.rotation.x = -1.7 + Math.sin(time * 4) * 0.16
      if (waving && !brewing) { rightArm.current.rotation.x = -2.5; rightArm.current.rotation.z = -0.2 + Math.sin(time * 14) * 0.4 }
      if (stretch > 0) leftArm.current.rotation.x = rightArm.current.rotation.x = THREE.MathUtils.lerp(0, -2.9, stretch)
      if (shooting) { leftArm.current.rotation.x = -1.4; rightArm.current.rotation.x = -1.3 + Math.sin(shot.phase * 6) * 0.12 }
    }
    if (body.current) {
      const talk = station.state === 'Collaborating' && !walking ? Math.abs(Math.sin(time * 5)) * 0.03 : 0
      const breathe = station.state === 'Idle' ? Math.sin(time * 2) * 0.015 : 0
      const bob = walking ? Math.abs(Math.sin(time * 10)) * 0.035 * stride : 0
      body.current.position.y = -0.14 * sit.current + talk + breathe + bob
      body.current.rotation.x = shooting ? 0.25 : -0.1 * stretch
      body.current.rotation.z = walking ? Math.sin(time * 10) * 0.03 * stride : 0
    }
    const blink = (time + phase) % 3.8 < 0.12 || stretch > 0.4 ? 0.1 : 1
    if (leftEye.current && rightEye.current) leftEye.current.scale.y = rightEye.current.scale.y = blink
    if (dots.current) {
      dots.current.visible = typing
      if (typing) dots.current.children.forEach((dot, i) => { const t = Math.max(0, Math.sin(time * 6 - i * 0.9)); dot.position.y = t * 0.07; dot.scale.setScalar(0.75 + t * 0.5) })
    }
    if (prevState.current !== station.state) {
      if ((prevState.current === 'Working' || prevState.current === 'Reviewing') && station.state === 'Idle') popAt.current = time
      prevState.current = station.state
    }
    const popAge = time - popAt.current
    if (pop.current) {
      pop.current.visible = popAge >= 0 && popAge < 1.8
      if (pop.current.visible) {
        const k = popAge / 1.8
        if (popRing.current) { popRing.current.scale.setScalar(0.3 + k * 1.5); (popRing.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k) }
        popSparks.current?.children.forEach((spark, i) => {
          const angle = (i / 6) * Math.PI * 2 + 0.5; const radius = 0.25 + k * 0.7
          spark.position.set(Math.cos(angle) * radius, 1 + k * 0.9 + Math.sin(k * Math.PI) * 0.2, Math.sin(angle) * radius)
          spark.scale.setScalar(Math.max(0.01, 1 - k))
        })
      }
    }
    if (dust.current) {
      const step = Math.sign(Math.sin(time * 10))
      if (walking && stride > 0.6 && step !== lastStep.current) {
        lastStep.current = step
        const index = nextPuff.current++ % 4
        puffAge.current[index] = 0
        dust.current.children[index].position.set(group.position.x - Math.sin(group.rotation.y) * 0.15 + step * 0.1 * Math.cos(group.rotation.y), 0.06, group.position.z - Math.cos(group.rotation.y) * 0.15 - step * 0.1 * Math.sin(group.rotation.y))
      } else if (!walking) lastStep.current = 0
      dust.current.children.forEach((puff, i) => {
        const age = puffAge.current[i] += delta
        puff.visible = age < 0.6
        if (puff.visible) { puff.scale.setScalar(0.5 + age * 2.2); ((puff as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.28 * (1 - age / 0.6) }
      })
    }
    if (head.current) {
      const lookingAt = lounge ? idle.peer && elapsed % 10 < 5 ? idle.peer : [layout.loungeX + 3.2, 1.55, -1] : undefined
      const angle = lookingAt ? Math.atan2(lookingAt[0] - group.position.x, lookingAt[2] - group.position.z) - group.rotation.y : 0
      // Between tasks an agent glances around now and then; while typing they mostly look at the screen.
      const glance = Math.sin((time + phase) * 0.6) * (Math.sin((time + phase) * 0.23) > 0.3 ? (working ? 0.15 : 0.5) : 0.04)
      const target = lookingAt ? Math.max(-0.85, Math.min(0.85, Math.atan2(Math.sin(angle), Math.cos(angle)))) : walking ? 0 : glance
      head.current.rotation.y = THREE.MathUtils.damp(head.current.rotation.y, target, 5, delta)
      head.current.rotation.x = -0.3 * stretch
    }
    if (cue.current) {
      cue.current.visible = billiards
      cue.current.position.set(0.25, shooting ? 1.06 : 0.8, shooting ? 0.5 + (shot.strike ? 0.3 : Math.sin(shot.phase * 6) * 0.08) : 0.1)
      cue.current.rotation.x = shooting ? 0 : -1.2
    }
    if (mug.current) {
      const carrying = idle?.action === 'lounge'
      mug.current.visible = brewing || carrying
      mug.current.rotation.set(0, 0, 0)
      mug.current.position.set(0.32, 1, 0.35)
      if (brewing) mug.current.position.set(0, 1.49, 0.6).lerp(cupTarget.set(0.32, 1, 0.35), THREE.MathUtils.smoothstep(elapsed, 8, 10))
      if (lounge && idle.table) {
        const motion = sipMotion(elapsed, idle.slot)
        group.updateWorldMatrix(true, false)
        cupTarget.set(...idle.table); group.worldToLocal(cupTarget)
        mug.current.position.lerp(cupTarget, motion.placing)
        if (motion.lift > 0) mug.current.position.lerp(armTarget.set(0.12, 1.23, 0.33), motion.lift)
        mug.current.rotation.x = -motion.tilt
        if (body.current) body.current.rotation.x = motion.lift > 0 && motion.lift < 0.9 || motion.placing < 1 ? 0.14 : 0
      }
      // Aim the hand at this one physical cup during carry / pick-up / put-down.
      const motion = lounge ? sipMotion(elapsed, idle!.slot) : undefined
      const holding = mug.current.visible && (!lounge || !motion || motion.placing < 1 || motion.lift > 0)
      if (holding && rightArm.current && body.current) {
        body.current.updateWorldMatrix(true, false)
        armTarget.copy(mug.current.position); group.localToWorld(armTarget); body.current.worldToLocal(armTarget)
        armTarget.sub(rightArm.current.position)
        rightArm.current.scale.y = armTarget.length() / 0.52
        rightArm.current.quaternion.setFromUnitVectors(ARM_DOWN, armTarget.normalize())
      }
    }
  })

  return <>
  <group ref={root} position={start}>
    <group ref={body} scale={scale} onClick={onSelect && ((event) => { event.stopPropagation(); onSelect(station, null) })} onPointerOver={onSelect && (() => { document.body.style.cursor = 'pointer' })} onPointerOut={onSelect && (() => { document.body.style.cursor = '' })}>
      <mesh ref={leftLeg} position={[-0.11, 0.66, 0]} castShadow geometry={legGeometry}><meshStandardMaterial color={tint(colors.pants)} roughness={0.8}/></mesh>
      <mesh ref={rightLeg} position={[0.11, 0.66, 0]} castShadow geometry={legGeometry}><meshStandardMaterial color={tint(colors.pants)} roughness={0.8}/></mesh>
      <RBox position={[0, 0.98, 0]} size={[0.48, 0.58, 0.3]} radius={0.07} color={tint(colors.shirt)} roughness={0.85}/>
      <mesh ref={leftArm} position={[-0.31, 1.2, 0]} castShadow geometry={armGeometry}><meshStandardMaterial color={tint(colors.shirt)} roughness={0.85}/></mesh>
      <mesh ref={rightArm} position={[0.31, 1.2, 0]} castShadow geometry={armGeometry}><meshStandardMaterial color={tint(colors.shirt)} roughness={0.85}/></mesh>
      <group ref={head} position={[0, 1.5, 0]}>
        <RBox position={[0, 0, 0]} size={[0.4, 0.4, 0.37]} radius={0.08} color={tint(colors.skin)} roughness={0.7}/>
        <RBox position={[0, 0.22, -0.02]} size={[0.43, 0.13, 0.41]} radius={0.05} color={tint(colors.hair)} roughness={0.9}/>
        <RBox position={[0, 0.08, -0.19]} size={[0.43, 0.3, 0.06]} radius={0.03} color={tint(colors.hair)} roughness={0.9}/>
        <group ref={leftEye} position={[-0.09, 0.02, 0.186]}><RBox position={[0, 0, 0]} size={[0.06, 0.07, 0.01]} radius={0.004} color="#17201e" shadow={false}/></group>
        <group ref={rightEye} position={[0.09, 0.02, 0.186]}><RBox position={[0, 0, 0]} size={[0.06, 0.07, 0.01]} radius={0.004} color="#17201e" shadow={false}/></group>
        <RBox position={[0, -0.1, 0.186]} size={[0.12, 0.025, 0.01]} radius={0.004} color="#9a5a44" shadow={false}/>
      </group>
      {unknown && <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.45, 0.55, 24]}/><meshBasicMaterial color="#e9c47b" transparent opacity={0.85}/></mesh>}
      <group ref={dots} position={[0, 1.95, 0]} visible={false}>{[-0.13, 0, 0.13].map((x) => <mesh key={x} position={[x, 0, 0]}><sphereGeometry args={[0.04, 8, 6]}/><meshBasicMaterial color="#58857b"/></mesh>)}</group>
      <object3D ref={anchor} position={[0, 2.05, 0]}/>
    </group>
    <group ref={pop} visible={false}>
      <mesh ref={popRing} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.85, 1, 32]}/><meshBasicMaterial color="#6fc7a1" transparent opacity={0.7} depthWrite={false} side={THREE.DoubleSide}/></mesh>
      <group ref={popSparks}>{Array.from({ length: 6 }, (_, i) => <mesh key={i}><octahedronGeometry args={[0.07]}/><meshBasicMaterial color="#ffd66b"/></mesh>)}</group>
    </group>
    <CoffeeMug ref={mug}/>
    <group ref={cue} visible={false}><mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.014, 0.024, 2.2, 8]}/><meshStandardMaterial color="#d4b27e"/></mesh></group>
  </group>
  <group ref={dust}>{[0, 1, 2, 3].map((i) => <mesh key={i} visible={false}><sphereGeometry args={[0.1, 8, 6]}/><meshBasicMaterial color="#d8cdb8" transparent opacity={0} depthWrite={false}/></mesh>)}</group>
  </>
}

/** Every character's root, so a walking agent can notice a colleague and wave. */
const crowd = new Map<string, THREE.Object3D>()

// Legs and arms pivot at the hip / shoulder: translate the geometry so its top sits at the origin.
const legGeometry = new THREE.BoxGeometry(0.17, 0.62, 0.2).translate(0, -0.31, 0)
const armGeometry = new THREE.BoxGeometry(0.12, 0.52, 0.14).translate(0, -0.26, 0)
const ARM_DOWN = new THREE.Vector3(0, -1, 0)
const NO_INTERACTIONS: OfficeInteraction[] = []
const NO_SUBAGENTS: OfficeSubagent[] = []

/** A subagent drawn with the Character rig: always busy, never opens a station dialog. */
function subagentStation(subagent: OfficeSubagent): OfficeStation {
  return { id: subagent.id, name: `Subagen ${subagent.index + 1}`, role: `Subagent of ${subagent.owner}`, room: 'Workspace', roomPosition: 'subagent', state: 'Working', currentTask: subagent.goal ?? '', recentActivity: '', activity: subagent.goal ?? '', seat: 0, provenance: 'delegation manifest', freshness: '' }
}

/**
 * Screen-space labels: each frame, project every anchor into the canvas and move its DOM label
 * there directly (no React re-render). Labels live outside the Canvas, so they unmount cleanly
 * and use the page's own styles and focus handling.
 */
function LabelProjector({ anchors, labels }: { anchors: Registry<THREE.Object3D>; labels: Registry<HTMLElement> }) {
  const point = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    const projected: { element: HTMLElement; x: number; y: number; depth: number }[] = []
    for (const [key, object] of anchors.current) {
      const element = labels.current.get(key)
      if (!element) continue
      object.getWorldPosition(point).project(camera)
      const visible = point.z < 1 && Math.abs(point.x) <= 1.1 && Math.abs(point.y) <= 1.1
      element.style.visibility = visible ? 'visible' : 'hidden'
      if (visible) projected.push({ element, x: ((point.x + 1) / 2) * size.width, y: ((1 - point.y) / 2) * size.height, depth: point.z })
    }
    // Nearest labels keep their spot; a farther label that would overlap one already placed is
    // lifted above it, so every agent stays readable and clickable.
    projected.sort((a, b) => a.depth - b.depth)
    const placed: { left: number; right: number; top: number; bottom: number }[] = []
    for (const label of projected) {
      const width = label.element.offsetWidth
      const height = label.element.offsetHeight
      const x = Math.min(Math.max(label.x, width / 2 + 4), size.width - width / 2 - 4)
      let bottom = label.y
      const left = x - width / 2
      const right = x + width / 2
      for (let guard = 0; guard < 6; guard += 1) {
        const hit = placed.find((box) => left < box.right && right > box.left && bottom - height < box.bottom && bottom > box.top)
        if (!hit) break
        bottom = hit.top - 4
      }
      placed.push({ left, right, top: bottom - height, bottom })
      label.element.style.transform = `translate(${x}px, ${Math.max(bottom, height + 4)}px) translate(-50%, -100%)`
      label.element.style.zIndex = String(Math.round((1 - label.depth) * 10_000))
    }
  })
  return null
}

export interface ViewHandle { reset: () => void }

/** Orbit (drag), pan (right-drag, two fingers, arrow keys or pan mode) and zoom, kept in bounds. */
const Controls = forwardRef<ViewHandle, { panMode: boolean; keyTarget: HTMLElement | null; layout: CompanyLayout }>(function Controls({ panMode, keyTarget, layout }, handle) {
  const { camera, gl, size } = useThree()
  const controls = useRef<OrbitControls | null>(null)
  const { target: cameraTarget, offset: cameraOffset } = layout.camera
  const target = useMemo(() => new THREE.Vector3(...cameraTarget), [cameraTarget])
  const frame = useMemo(() => () => {
    const aspect = size.width / Math.max(size.height, 1)
    const offset = new THREE.Vector3(...cameraOffset)
    // Narrow (portrait) views need to back off so the whole building fits across.
    offset.setLength(offset.length() * Math.max(1, 1.85 / aspect))
    const focus = target.clone().set(aspect < 1 ? cameraTarget[0] - 1.4 : cameraTarget[0], cameraTarget[1], aspect < 1 ? 0.8 : cameraTarget[2])
    const orbit = controls.current
    // An undamped update applies and clears any momentum left from an earlier drag,
    // so it has to happen before the camera is placed, not after.
    if (orbit) { orbit.enableDamping = false; orbit.update() }
    camera.position.copy(focus).add(offset)
    camera.lookAt(focus)
    if (!orbit) return
    orbit.target.copy(focus)
    orbit.update()
    orbit.enableDamping = true
  }, [camera, size.width, size.height, target, cameraOffset, cameraTarget])

  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement)
    orbit.enableDamping = true
    orbit.screenSpacePanning = false // pan across the floor, not up into the sky
    orbit.minDistance = 5
    orbit.maxDistance = Math.max(60, new THREE.Vector3(...cameraOffset).length() * 3)
    orbit.minPolarAngle = 0.2
    orbit.maxPolarAngle = 1.32
    orbit.keyPanSpeed = 25
    controls.current = orbit
    frame()
    return () => { orbit.dispose(); controls.current = null }
    // frame() only sets the initial view; re-running it on resize is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl])
  useEffect(() => { frame() }, [frame])
  useEffect(() => {
    const orbit = controls.current
    if (!orbit) return
    orbit.mouseButtons.LEFT = panMode ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE
    orbit.mouseButtons.RIGHT = panMode ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN
    orbit.touches.ONE = panMode ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE
  }, [panMode])
  useEffect(() => {
    const orbit = controls.current
    if (!orbit || !keyTarget) return
    orbit.listenToKeyEvents(keyTarget)
    return () => orbit.stopListenToKeyEvents()
  }, [keyTarget])
  useImperativeHandle(handle, () => ({ reset: frame }), [frame])

  useFrame(() => {
    const orbit = controls.current
    if (!orbit) return
    orbit.update()
    const [x, z] = clampTarget(orbit.target.x, orbit.target.z, layout.pan)
    if (x !== orbit.target.x || z !== orbit.target.z) {
      const shift = new THREE.Vector3(x - orbit.target.x, 0, z - orbit.target.z)
      orbit.target.add(shift)
      camera.position.add(shift)
    }
  })
  return null
})

function register<T>(registry: Registry<T>, key: string) {
  return (value: T | null) => { if (value) registry.current.set(key, value); else registry.current.delete(key) }
}

/** Current time, refreshed every `interval` ms. */
function useClock(interval: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval)
    return () => window.clearInterval(timer)
  }, [interval])
  return now
}

const DAY_SKY = new THREE.Color('#eae4db'); const NIGHT_SKY = new THREE.Color('#2b3446'); const DUSK_SKY = new THREE.Color('#e8b88a')
const DAY_SUN = new THREE.Color('#fff4dd'); const NIGHT_SUN = new THREE.Color('#9db3e6'); const DUSK_SUN = new THREE.Color('#ffb878')

/** Daylight that follows the real time of day (see day-cycle.ts), never darker than 60% so the office stays readable. */
function Lighting() {
  const scene = useThree((state) => state.scene)
  const hemisphere = useRef<THREE.HemisphereLight>(null)
  const sun = useRef<THREE.DirectionalLight>(null)
  const ambient = useRef<THREE.AmbientLight>(null)
  useFrame(() => {
    const { daylight, warmth, light } = dayCycle(currentHour())
    ;(scene.background as THREE.Color).lerpColors(NIGHT_SKY, DAY_SKY, daylight).lerp(DUSK_SKY, warmth * 0.4)
    if (hemisphere.current) hemisphere.current.intensity = 1.7 * light
    if (ambient.current) ambient.current.intensity = 0.45 * light
    if (sun.current) { sun.current.intensity = 2.4 * light; sun.current.color.lerpColors(NIGHT_SUN, DAY_SUN, daylight).lerp(DUSK_SUN, warmth * 0.6) }
  })
  return <>
    <color attach="background" args={['#eae4db']}/>
    <hemisphereLight ref={hemisphere} args={['#fff8e9', '#9b8d74', 1.7]}/>
    <directionalLight ref={sun} position={[-3, 20, 8]} intensity={2.4} color="#fff4dd" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={25} shadow-camera-bottom={-25} shadow-camera-far={80}/>
    <ambientLight ref={ambient} intensity={0.45}/>
  </>
}

export default function Office3D({ stations, interactions = NO_INTERACTIONS, subagents = NO_SUBAGENTS, onSelect, onOpenBoard }: { stations: OfficeStation[]; interactions?: OfficeInteraction[]; subagents?: OfficeSubagent[]; onSelect: (station: OfficeStation, trigger: HTMLElement | null) => void; onOpenBoard: () => void }) {
  const anchors = useRef(new Map<string, THREE.Object3D>())
  const labels = useRef(new Map<string, HTMLElement>())
  const view = useRef<ViewHandle>(null)
  const [panMode, setPanMode] = useState(false)
  const [keyTarget, setKeyTarget] = useState<HTMLElement | null>(null)
  const [meeting, setMeeting] = useState(false)
  const boardSnapshot = usePolling<TaskBoardSnapshot>('/api/tasks', 15_000)
  const board = boardSnapshot.status === 'ready' ? boardSnapshot.data : undefined
  const now = useClock(2000)
  const rosterKey = JSON.stringify(stations.map((s) => s.id).sort())
  const layout = useMemo(() => companyLayout((JSON.parse(rosterKey) as string[]).map((id) => ({ id }))), [rosterKey])
  const director = useMemo(() => new IdleDirector(layout), [layout])
  const arrivals = useRef(new Map<string, string>())
  const [idlePlans, setIdlePlans] = useState(new Map<string, CompanyPlacement>())
  useEffect(() => {
    for (const id of arrivals.current.keys()) if (!stations.some((s) => s.id === id)) arrivals.current.delete(id)
    const tick = () => setIdlePlans(director.update(companyPlacements(stations, layout, interactions, Date.now(), meeting), arrivals.current, Date.now()))
    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [director, stations, layout, interactions, meeting])
  const placements = companyPlacements(stations, layout, interactions, now, meeting)
  for (const [id, p] of placements) if (p.intent === 'idle' && idlePlans.get(id)?.idle) placements.set(id, idlePlans.get(id)!)
  // Remember when each subagent first appeared, so its briefing at the owner's desk runs once.
  const firstSeen = useRef(new Map<string, number>())
  for (const id of firstSeen.current.keys()) if (!subagents.some((subagent) => subagent.id === id)) firstSeen.current.delete(id)
  for (const subagent of subagents) if (!firstSeen.current.has(subagent.id)) firstSeen.current.set(subagent.id, now)
  const subagentSpots = subagentPlacements(subagents, layout, firstSeen.current, now)
  const visibleSubagents = subagents.filter((subagent) => subagentSpots.has(subagent.id))
  const poolPlayers = [...placements.values()].flatMap((p) => p.idle?.action === 'billiards' && p.idle.arrivedAt !== undefined ? [{ slot: p.idle.slot, arrivedAt: p.idle.arrivedAt }] : [])
  return <div className="office-3d" ref={setKeyTarget} tabIndex={0} role="region" aria-label="3D office. Drag to rotate, right-drag or two fingers to pan, scroll to zoom, arrow keys pan when focused.">
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [-3, 13, 16], fov: 40, near: 0.5, far: 500 }} gl={{ antialias: true }}>
      <Lighting/>
      <CompanyEnvironment layout={layout} tasks={board?.tasks.data ?? []} available={board?.tasks.availability === 'available'} partial={!!board?.failedBoards?.length} onOpenBoard={onOpenBoard} poolPlayers={poolPlayers}/>
      {[...layout.desks].map(([id, position]) => <WorkDesk key={id} position={position} active={stations.some((s) => s.id === id && ['Working', 'Reviewing', 'Collaborating'].includes(s.state))} withChair/>)}
      {stations.map((station) => <Character key={`${rosterKey}-${station.id}`} station={station} placement={placements.get(station.id)!} layout={layout} onSelect={onSelect} anchor={register(anchors, `agent-${station.id}`)} arrivals={arrivals} poolPlayers={poolPlayers}/>)}
      {visibleSubagents.map((subagent) => <Character key={`${rosterKey}-sub-${subagent.id}`} station={subagentStation(subagent)} placement={subagentSpots.get(subagent.id)!} layout={layout} anchor={register(anchors, `sub-${subagent.id}`)} arrivals={arrivals} poolPlayers={poolPlayers} look={subagent.owner} scale={0.8} start={subagentStart(subagent.owner, layout)}/>)}
      <LabelProjector anchors={anchors} labels={labels}/>
      <Controls key={layout.deskCount} ref={view} panMode={panMode} keyTarget={keyTarget} layout={layout}/>
    </Canvas>
    <div className="office-3d-labels">
      {stations.map((station) => {
        const badge = officeStateBadge(station.state)
        const busy = ['Working', 'Reviewing', 'Collaborating'].includes(station.state)
        const placement = placements.get(station.id)!
        return <button key={station.id} ref={register(labels, `agent-${station.id}`)} type="button" className={`agent-tag-3d state-${station.state.toLowerCase()}${placement.intent === 'meeting' ? ' in-meeting' : ''}`} onClick={(event) => onSelect(station, event.currentTarget)} aria-label={`${station.label ?? station.name}. ${station.state}. ${placement.label}. Open station details.`}>
          {placement.intent === 'handoff' ? <span className="speech speech-3d">{placement.label}</span> : placement.intent !== 'meeting' && busy && station.activity && <span className="speech speech-3d">{station.activity}</span>}
          <span className="agent-tag-row"><span className="pixel-station-name">{officeRole(station.id) === 'ceo' ? 'CEO · ' : ''}{station.label ?? station.name}</span>{placement.intent !== 'meeting' && <span className={`badge ${badge.tone}`}>{station.state}</span>}</span>
        </button>
      })}
      {visibleSubagents.map((subagent) => {
        const placement = subagentSpots.get(subagent.id)!
        return <div key={subagent.id} ref={register(labels, `sub-${subagent.id}`)} className={`agent-tag-3d subagent-tag-3d state-${subagent.status === 'working' ? 'working' : 'idle'}`} role="note" aria-label={`Subagent ${subagent.index + 1} of ${subagent.owner}. ${placement.label}.`} title={subagent.goal}>
          <span className="speech speech-3d">{placement.label}</span>
          <span className="agent-tag-row"><span className="pixel-station-name">Subagen {subagent.index + 1} · {stations.find((s) => s.id === subagent.owner)?.label ?? subagent.owner}</span><span className={`badge ${subagent.status === 'working' ? 'good' : 'muted'}`}>{subagent.status === 'working' ? 'Working' : 'Selesai'}</span></span>
        </div>
      })}
    </div>
    <div className="office-3d-tools">
      <button type="button" className={meeting ? 'active' : ''} aria-pressed={meeting} onClick={() => setMeeting((value) => !value)} title="Mengumpulkan karakter secara visual saja; tidak mengirim tugas ke Hermes">{meeting ? 'Akhiri rapat visual' : 'Rapat bersama (visual)'}</button>
      <button type="button" onClick={onOpenBoard}>▦ Kanban</button>
      <button type="button" className={panMode ? 'active' : ''} aria-pressed={panMode} onClick={() => setPanMode((value) => !value)} title="Drag moves the view instead of rotating it">✥ Geser</button>
      <button type="button" onClick={() => view.current?.reset()} title="Back to the starting view">↺ Reset view</button>
    </div>
  </div>
}
