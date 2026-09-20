const localKey = (datasetId) => `mesh-atlas:annotations:${datasetId}`

function readLocal(datasetId) {
  try { return JSON.parse(localStorage.getItem(localKey(datasetId)) || '[]') } catch { return [] }
}

function writeLocal(datasetId, annotations) {
  localStorage.setItem(localKey(datasetId), JSON.stringify(annotations))
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  if (!response.ok) throw new Error(`Server returned ${response.status}`)
  return response.json()
}

export async function loadDataset(dataset) {
  try {
    await request(`/api/datasets/${dataset.id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: dataset.name, vertices: dataset.stats.vertices, triangles: dataset.stats.triangles, meshes: dataset.stats.meshes }),
    })
    const annotations = await request(`/api/datasets/${dataset.id}/annotations`)
    return { annotations, storage: 'database' }
  } catch {
    return { annotations: readLocal(dataset.id), storage: 'browser' }
  }
}

export async function createAnnotation(datasetId, annotation, storage) {
  if (storage === 'database') {
    return request(`/api/datasets/${datasetId}/annotations`, { method: 'POST', body: JSON.stringify(annotation) })
  }
  const created = { ...annotation, id: crypto.randomUUID(), created_at: new Date().toISOString() }
  writeLocal(datasetId, [...readLocal(datasetId), created])
  return created
}

export async function deleteAnnotation(datasetId, annotationId, storage) {
  if (storage === 'database') {
    await request(`/api/annotations/${annotationId}`, { method: 'DELETE' })
    return
  }
  writeLocal(datasetId, readLocal(datasetId).filter((annotation) => annotation.id !== annotationId))
}
