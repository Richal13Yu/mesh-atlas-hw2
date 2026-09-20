import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

export async function modelIdFor(name, buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${name.replace(/[^a-z0-9.-]/gi, '_').slice(0, 50)}-${hex.slice(0, 20)}`
}

export function parseModel(name, buffer) {
  const ext = name.split('.').at(-1)?.toLowerCase()
  let object
  if (ext === 'stl') {
    const geometry = new STLLoader().parse(buffer)
    if (!geometry.attributes.normal) geometry.computeVertexNormals()
    object = new THREE.Group()
    object.add(new THREE.Mesh(geometry))
  } else if (ext === 'obj') {
    object = new OBJLoader().parse(new TextDecoder().decode(buffer))
  } else {
    throw new Error('Choose an OBJ or STL file.')
  }

  let vertices = 0
  let triangles = 0
  let meshes = 0
  object.traverse((child) => {
    if (!child.isMesh) return
    meshes += 1
    const geometry = child.geometry
    vertices += geometry.attributes.position?.count || 0
    triangles += Math.floor((geometry.index?.count || geometry.attributes.position?.count || 0) / 3)
    child.material = new THREE.MeshStandardMaterial({
      color: '#d7a67e', metalness: 0.08, roughness: 0.72, side: THREE.DoubleSide,
      flatShading: false,
    })
  })
  if (!meshes || !vertices) throw new Error('This file does not contain a renderable mesh.')

  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const longestSide = Math.max(size.x, size.y, size.z)
  if (!Number.isFinite(longestSide) || longestSide <= 0) throw new Error('The mesh has no usable dimensions.')
  const center = box.getCenter(new THREE.Vector3())
  const scale = 3.4 / longestSide
  object.scale.setScalar(scale)
  object.position.copy(center).multiplyScalar(-scale)

  return {
    object,
    stats: { vertices, triangles, meshes, dimensions: [size.x, size.y, size.z] },
  }
}

export function formatPosition(point) {
  return [point.x, point.y, point.z].map((value) => Number(value).toFixed(2)).join(', ')
}
