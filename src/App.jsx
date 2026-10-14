import React, { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import { createAnnotation, deleteAnnotation, loadDataset } from './api.js'
import { formatPosition, modelIdFor, parseModel } from './mesh.js'
import { PredictionPanel, TrainingLab, useLearning } from './Learning.jsx'

const LABELS = {
  feature: { text: 'Feature', color: '#a5b9ef' },
  defect: { text: 'Defect', color: '#f2a374' },
  reference: { text: 'Reference', color: '#9ad1ac' },
  other: { text: 'Other', color: '#ded1ab' },
}

function Icon({ name, size = 18 }) {
  const paths = {
    cube: <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 7 9 5v10l-9-5V7Zm18 0-9 5v10l9-5V7Z"/></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5"/><path d="M4 16v4h16v-4"/></>,
    pin: <><path d="M12 21s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12Z"/><circle cx="12" cy="9" r="2"/></>,
    reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5M3 17l9 5 9-5"/></>,
    trash: <><path d="M4 7h16M10 7V4h4v3m4 0-1 14H7L6 7m4 4v6m4-6v6"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function Scene({ model, annotations, selectedId, annotateMode, wireframe, onSurfaceClick, onSelectAnnotation }) {
  useEffect(() => {
    model?.object.traverse((child) => {
      if (child.isMesh) {
        child.material.wireframe = wireframe
        child.material.needsUpdate = true
      }
    })
  }, [model, wireframe])

  return <>
    <color attach="background" args={['#131e29']} />
    <ambientLight intensity={1.55} />
    <directionalLight position={[5, 6, 6]} intensity={2.1} />
    <directionalLight position={[-4, -2, -4]} intensity={0.7} color="#9fb5d5" />
    <gridHelper args={[10, 20, '#415260', '#263541']} position={[0, -2.1, 0]} />
    <axesHelper args={[1]} position={[-2.5, -2.05, -2.5]} />
    {model && <primitive object={model.object} onClick={(event) => {
      if (!annotateMode) return
      event.stopPropagation()
      onSurfaceClick({ x: event.point.x, y: event.point.y, z: event.point.z })
    }} />}
    {annotations.map((annotation) => <mesh
      key={annotation.id}
      position={[annotation.x, annotation.y, annotation.z]}
      onClick={(event) => { event.stopPropagation(); onSelectAnnotation(annotation.id) }}
    >
      <sphereGeometry args={[0.055, 16, 16]} />
      <meshBasicMaterial color={LABELS[annotation.label]?.color || LABELS.other.color} depthTest={false} />
      {selectedId === annotation.id && <Html distanceFactor={8} position={[0, 0.12, 0]} center><div className="pin-tooltip">{annotation.title}</div></Html>}
    </mesh>)}
    <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={1.5} maxDistance={15} />
  </>
}

export default function App() {
  const fileInput = useRef(null)
  const loadSequence = useRef(0)
  const learning = useLearning()
  const [view, setView] = useState('explore')
  const [dataset, setDataset] = useState(null)
  const [annotations, setAnnotations] = useState([])
  const [storage, setStorage] = useState('browser')
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState('')
  const [annotateMode, setAnnotateMode] = useState(false)
  const [pendingPoint, setPendingPoint] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [label, setLabel] = useState('feature')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [wireframe, setWireframe] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  async function openModel(name, buffer) {
    const sequence = ++loadSequence.current
    setBusy(true)
    setMessage('')
    try {
      const parsed = parseModel(name, buffer)
      const id = await modelIdFor(name, buffer)
      if (sequence !== loadSequence.current) return
      setDataset({ id, name, ...parsed })
      setSelectedId(null)
      setPendingPoint(null)
      setAnnotateMode(false)
      setWireframe(false)
      setResetKey((value) => value + 1)
    } catch (error) {
      setMessage(error.message || 'Could not open this mesh.')
    } finally {
      if (sequence === loadSequence.current) setBusy(false)
    }
  }

  useEffect(() => {
    let active = true
    fetch('/examples/torus.obj')
      .then((response) => { if (!response.ok) throw new Error('Sample mesh unavailable.'); return response.arrayBuffer() })
      .then((buffer) => { if (active) openModel('torus.obj', buffer) })
      .catch((error) => { if (active) { setMessage(error.message); setBusy(false) } })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!dataset) return
    let active = true
    setAnnotations([])
    loadDataset(dataset).then((result) => {
      if (active) { setAnnotations(result.annotations); setStorage(result.storage) }
    })
    return () => { active = false }
  }, [dataset])

  async function openExample(name) {
    try {
      const response = await fetch(`/examples/${name.toLowerCase()}.obj`)
      if (!response.ok) throw new Error('Example mesh unavailable.')
      await openModel(`${name.toLowerCase()}.obj`, await response.arrayBuffer())
      setView('explore')
    } catch (error) { setMessage(error.message) }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    await openModel(file.name, await file.arrayBuffer())
    setView('explore')
    event.target.value = ''
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!dataset || !pendingPoint || !title.trim()) return
    try {
      const created = await createAnnotation(dataset.id, {
        ...pendingPoint, label, title: title.trim(), note: note.trim(),
      }, storage)
      setAnnotations((items) => [...items, created])
      setSelectedId(created.id)
      setPendingPoint(null)
      setTitle('')
      setNote('')
      setAnnotateMode(false)
      setMessage('Surface point saved.')
    } catch (error) { setMessage(`Could not save annotation: ${error.message}`) }
  }

  async function handleDelete(id) {
    if (!dataset) return
    try {
      await deleteAnnotation(dataset.id, id, storage)
      setAnnotations((items) => items.filter((item) => item.id !== id))
      setSelectedId(null)
      setMessage('Annotation removed.')
    } catch (error) { setMessage(`Could not delete annotation: ${error.message}`) }
  }

  const selected = annotations.find((annotation) => annotation.id === selectedId)

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-icon"><Icon name="cube" size={21} /></span><span>mesh<span className="brand-accent">atlas</span></span><span className="brand-divider"/><span className="brand-subtitle">RESEARCH WORKSPACE</span></div>
      <div className="topbar-right"><span className="status-dot"/><span>HW2 · LEARNING ENABLED</span><button className="top-upload" onClick={() => fileInput.current?.click()}><Icon name="upload" size={16}/> Open mesh</button></div>
    </header>

    <div className="workspace">
      <aside className="sidebar left-panel">
        <div className="panel-kicker">WORKSPACE / 02</div>
        <h1>Shapes<br/><em>that learn.</em></h1>
        <p className="intro">Explore a mesh, predict its shape family, and watch a neural network learn.</p>
        <nav className="workspace-nav" aria-label="Workspace"><button className={view === 'explore' ? 'selected' : ''} onClick={() => setView('explore')}>01 <span>Explore & predict</span></button><button className={view === 'training' ? 'selected' : ''} onClick={() => setView('training')}>02 <span>Training lab</span></button></nav><div className="side-section-label">CURRENT DATASET</div>
        <button className="dataset-card" onClick={() => fileInput.current?.click()}>
          <span className="dataset-icon"><Icon name="cube" size={20}/></span>
          <span className="dataset-text"><strong>{dataset?.name || 'Loading sample mesh'}</strong><small>{dataset ? 'OBJ / STL model' : 'Please wait…'}</small></span>
          <span className="dataset-arrow">↗</span>
        </button>
        <button className="outline-button full" onClick={() => fileInput.current?.click()}><Icon name="upload" size={17}/> Upload OBJ or STL</button>
        <input ref={fileInput} type="file" accept=".obj,.stl" onChange={handleUpload} hidden aria-label="Upload OBJ or STL mesh"/>

        <div className="example-section"><div className="side-section-label">TRY A SYNTHETIC SHAPE</div><div className="example-buttons">{['Ellipsoid', 'Cuboid', 'Cylinder', 'Torus'].map(name => <button key={name} onClick={() => openExample(name)} className={dataset?.name === `${name.toLowerCase()}.obj` ? 'selected' : ''}>{name}</button>)}</div><p className="sample-note">Examples are independent of the training, validation and test sets.</p></div>
        <div className="sidebar-bottom"><div className="side-section-label">THE LEARNING PIPELINE</div><div className="workflow-item"><span>01</span> Sample the mesh surface</div><div className="workflow-item"><span>02</span> Extract 24 shape features</div><div className="workflow-item"><span>03</span> Predict with a trained MLP</div><p className="sample-note">OBJ / STL · PyTorch · FastAPI<br/>Synthetic data, reproducible training.</p></div>
      </aside>

      <main className="main-panel">
        {view === 'training' ? <TrainingLab learning={learning}/> : <>
        <div className="main-heading"><div><div className="eyebrow">3D MODEL VIEWER <span>/</span> SURFACE ANALYSIS</div><h2>{dataset?.name || 'Preparing viewer'}</h2><p>Explore the geometry, then ask the neural network to classify it.</p></div><div className="model-badge"><span/> {dataset ? 'MODEL LOADED' : 'LOADING'}</div></div>

        <section className="viewer-card" aria-label="3D mesh viewer">
          <div className="viewer-toolbar"><div className="viewer-toolbar-title"><span className="tiny-square"/> PERSPECTIVE VIEW <span className="toolbar-separator">/</span> {dataset?.name || '—'}</div><div className="toolbar-actions"><button className={wireframe ? 'tool-button active' : 'tool-button'} onClick={() => setWireframe((value) => !value)} title="Toggle wireframe"><Icon name="layers" size={17}/> <span>Wireframe</span></button><button className="tool-button" onClick={() => setResetKey((value) => value + 1)} title="Reset view"><Icon name="reset" size={17}/> <span>Reset view</span></button></div></div>
          <div className={annotateMode ? 'canvas-wrap annotating' : 'canvas-wrap'}>
            {dataset ? <Canvas key={resetKey} camera={{ position: [4.3, 3.0, 5.1], fov: 45, near: 0.01, far: 100 }} gl={{ antialias: true }}>
              <Scene model={dataset} annotations={annotations} selectedId={selectedId} annotateMode={annotateMode} wireframe={wireframe} onSurfaceClick={(point) => { setPendingPoint(point); setAnnotateMode(false); setTitle(''); setNote('') }} onSelectAnnotation={setSelectedId} />
            </Canvas> : <div className="canvas-loading">{busy ? 'Loading geometry…' : 'Choose an OBJ or STL file.'}</div>}
            <div className="canvas-tag">{annotateMode ? 'CLICK A SURFACE POINT' : 'INTERACTIVE 3D VIEW'}</div>
            <div className="axis-key"><span className="axis-x">X</span><span className="axis-y">Y</span><span className="axis-z">Z</span></div>
          </div>
          <div className="viewer-footer"><span><strong>ROTATE</strong> drag left</span><span><strong>PAN</strong> drag right</span><span><strong>ZOOM</strong> scroll</span><span className="footer-count">{annotations.length} MARKER{annotations.length === 1 ? '' : 'S'}</span></div>
        </section>

        <div className="below-viewer"><div><div className="eyebrow">RESEARCH NOTE</div><h3>From geometry to prediction.</h3><p>Select Predict shape in the inspector. Surface markers remain available for your research observations.</p></div><button className={annotateMode ? 'primary-button active' : 'primary-button'} onClick={() => { setAnnotateMode((value) => !value); setPendingPoint(null) }} disabled={!dataset}><Icon name="pin" size={18}/>{annotateMode ? 'Cancel marking' : 'Add surface marker'}</button></div>
        </>}
        {message && <div className="toast" role="status">{message}<button onClick={() => setMessage('')} aria-label="Dismiss message">×</button></div>}
      </main>

      <aside className="sidebar right-panel">
        <PredictionPanel dataset={dataset} learning={learning} onTrain={() => setView('training')}/>
        <div className="right-header"><div><div className="panel-kicker">MODEL INSPECTOR</div><h3>Geometry details</h3></div><Icon name="layers" size={19}/></div>
        <div className="stat-grid"><div className="stat"><span>VERTICES</span><strong>{dataset?.stats.vertices.toLocaleString() || '—'}</strong></div><div className="stat"><span>TRIANGLES</span><strong>{dataset?.stats.triangles.toLocaleString() || '—'}</strong></div><div className="stat"><span>MESHES</span><strong>{dataset?.stats.meshes || '—'}</strong></div><div className="stat"><span>LABELS</span><strong>{annotations.length}</strong></div></div>
        <div className="dimension-box"><span>BOUNDING SIZE <small>source units</small></span><strong>{dataset?.stats.dimensions.map((value) => value.toFixed(2)).join(' × ') || '—'}</strong></div>
        <div className="annotations-head"><div><div className="panel-kicker">SURFACE NOTES</div><h3>Annotations <span>{annotations.length}</span></h3></div><button className="small-add" onClick={() => { setAnnotateMode(true); setPendingPoint(null) }} disabled={!dataset}>+</button></div>
        {pendingPoint && <form className="annotation-form" onSubmit={handleSave}><div className="form-title">New surface marker</div><div className="coordinate">XYZ {formatPosition(pendingPoint)}</div><label>LABEL TYPE<select value={label} onChange={(event) => setLabel(event.target.value)}>{Object.entries(LABELS).map(([key, value]) => <option key={key} value={key}>{value.text}</option>)}</select></label><label>SHORT TITLE<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. edge defect" maxLength={80} required autoFocus/></label><label>NOTES <span>(OPTIONAL)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Describe this point…" maxLength={1000}/></label><div className="form-actions"><button type="button" onClick={() => setPendingPoint(null)}>Cancel</button><button type="submit">Save marker</button></div></form>}
        {annotations.length === 0 && !pendingPoint && <div className="empty-annotations"><span className="empty-icon"><Icon name="pin" size={24}/></span><strong>No markers yet</strong><p>Choose “Add surface marker,” then click a point on the mesh.</p></div>}
        <div className="annotation-list">{annotations.map((annotation) => <button key={annotation.id} className={selectedId === annotation.id ? 'annotation-item selected' : 'annotation-item'} onClick={() => setSelectedId(annotation.id)}><span className="label-dot" style={{ background: LABELS[annotation.label]?.color || LABELS.other.color }}/><span className="annotation-copy"><strong>{annotation.title}</strong><small>{LABELS[annotation.label]?.text || 'Other'} · {formatPosition(annotation)}</small></span></button>)}</div>
        {selected && <div className="selection-details"><div className="selection-head"><strong>{selected.title}</strong><button onClick={() => handleDelete(selected.id)} title="Delete annotation" aria-label="Delete annotation"><Icon name="trash" size={16}/></button></div><div className="coordinate">XYZ {formatPosition(selected)}</div>{selected.note && <p>{selected.note}</p>}</div>}
        <div className="storage-status"><span className="status-dot"/> Annotations saved in {storage === 'database' ? 'SQLite database' : 'this browser'}</div>
      </aside>
    </div>
  </div>
}
