import React, { useEffect, useRef, useState } from 'react'
import { request } from './api.js'
import { predictionTriangles } from './mesh.js'

const percent = (value) => `${(value * 100).toFixed(2)}%`
const classes = ['Ellipsoid', 'Cuboid', 'Cylinder', 'Torus']

export function useLearning() {
  const [model, setModel] = useState(null)
  const [error, setError] = useState('')
  const [job, setJob] = useState(null)
  const [runId, setRunId] = useState(() => sessionStorage.getItem('mesh-atlas:training-run'))
  const [starting, setStarting] = useState(false)
  const running = starting || ['queued', 'running', 'cancelling'].includes(job?.status)

  async function refresh() {
    try { setModel(await request('/api/model')); setError('') }
    catch (e) { setError(`Learning service unavailable. Start the backend, then reconnect. ${e.message}`) }
  }
  useEffect(() => { refresh() }, [])

  useEffect(() => {
    if (!runId) return
    let active = true
    let timer
    async function poll() {
      try {
        const result = await request(`/api/training/${runId}`)
        if (!active) return
        setJob(result)
        setError(result.status === 'failed' ? result.error : '')
        if (['queued', 'running', 'cancelling'].includes(result.status)) timer = setTimeout(poll, 150)
        else sessionStorage.removeItem('mesh-atlas:training-run')
      } catch (e) {
        if (active) {
          setError(`Could not follow this run. ${e.message}`)
          setJob(previous => previous ? { ...previous, status: 'disconnected' } : null)
          sessionStorage.removeItem('mesh-atlas:training-run')
        }
      }
    }
    poll()
    return () => { active = false; clearTimeout(timer) }
  }, [runId])

  async function start(config) {
    setStarting(true); setError('')
    try {
      const result = await request('/api/training', { method: 'POST', body: JSON.stringify(config) })
      setJob(result); setRunId(result.id)
      sessionStorage.setItem('mesh-atlas:training-run', result.id)
    } catch (e) { setError(e.message) }
    finally { setStarting(false) }
  }

  async function activate(id) {
    try { setModel(await request(`/api/model/activate/${id}`, { method: 'POST' })); setError('') }
    catch (e) { setError(e.message) }
  }

  async function cancel() {
    try { setJob(await request(`/api/training/${job.id}/cancel`, { method: 'POST' })) }
    catch (e) { setError(e.message) }
  }

  return { model, error, job, running, refresh, start, activate, cancel }
}

export function PredictionPanel({ dataset, learning, onTrain }) {
  const [prediction, setPrediction] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  useEffect(() => { sequence.current++; setPrediction(null); setError(''); setBusy(false) }, [dataset, learning.model?.id])

  async function predict() {
    const token = ++sequence.current
    setBusy(true); setPrediction(null); setError('')
    try {
      const result = await request('/api/predict', {
        method: 'POST', body: JSON.stringify({ triangles: predictionTriangles(dataset.object) }),
      })
      if (sequence.current === token) setPrediction(result)
    } catch (e) { if (sequence.current === token) setError(e.message) }
    finally { if (sequence.current === token) setBusy(false) }
  }

  return <section className="prediction-panel" aria-label="Shape prediction">
    <div className="panel-kicker">NEURAL NETWORK</div>
    <h3>What shape is this?</h3>
    <p className="learning-copy">24 geometric features → MLP → 4 shape families</p>
    <button className="primary-button full" onClick={predict} disabled={!dataset || !learning.model || busy}>{busy ? 'Analyzing geometry…' : 'Predict shape'}</button>
    {prediction ? <div className="prediction-result" aria-live="polite">
      <div className="prediction-heading"><strong>{prediction.class_name}</strong><span>{percent(Math.max(...prediction.probabilities.map(p => p.probability)))}</span></div>
      {prediction.probabilities.map(p => <div className="probability-row" key={p.label}>
        <div><span>{p.label}</span><span>{percent(p.probability)}</span></div>
        <div className="probability-track"><div style={{ width: `${p.probability * 100}%` }} /></div>
      </div>)}
      {prediction.warning && <p className="learning-warning">{prediction.warning}</p>}
      <p className="model-caption">Model: {prediction.model_id === 'reference' ? 'submitted reference' : prediction.model_id}</p>
    </div> : <p className="prediction-placeholder">Choose a sample or open a mesh, then predict.</p>}
    {error && <p role="alert" className="learning-error">{error}</p>}
    {learning.error && !learning.model && <><p className="learning-error" role="alert">{learning.error}</p><button className="text-button" onClick={learning.refresh}>Reconnect</button></>}
    <p className="scope-note">Trained on synthetic geometry only. Scores are softmax probabilities, not calibrated confidence. Unknown shapes still receive one of these four labels.</p>
    <button className="text-button" onClick={onTrain}>View results & train a model →</button>
  </section>
}

function Chart({ history, metric, title, selectedEpoch }) {
  if (!history?.length) return <div className="chart-empty">Waiting for the first epoch…</div>
  const width = 480, height = 220, left = 48, right = 15, top = 24, bottom = 36
  const maxEpoch = Math.max(1, history.at(-1).epoch)
  const maximum = metric === 'accuracy' ? 1 : Math.max(.05, ...history.flatMap(r => [r[`train_${metric}`], r[`validation_${metric}`]])) * 1.08
  const x = value => left + value / maxEpoch * (width - left - right)
  const y = value => height - bottom - value / maximum * (height - bottom - top)
  return <div className="chart-card"><h4>{title}</h4><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} against epoch, showing training and validation`}>
    {[0, .25, .5, .75, 1].map(t => <g key={t}>
      <line x1={left} x2={width - right} y1={y(t * maximum)} y2={y(t * maximum)} stroke="#34434d" />
      <text x={left - 8} y={y(t * maximum) + 4} textAnchor="end">{metric === 'accuracy' ? `${Math.round(t * 100)}%` : (t * maximum).toFixed(2)}</text>
    </g>)}
    {['train', 'validation'].map(split => <polyline key={split} fill="none" stroke={split === 'train' ? '#88c9bc' : '#e8aa79'} strokeWidth="2.5" points={history.map(r => `${x(r.epoch)},${y(r[`${split}_${metric}`])}`).join(' ')} />)}
    {selectedEpoch && <line x1={x(selectedEpoch)} x2={x(selectedEpoch)} y1={top} y2={height - bottom} stroke="#b7bdc4" strokeDasharray="3 4" />}
    <text x={left} y={height - 17}>0</text><text x={width - right} y={height - 17} textAnchor="end">{maxEpoch}</text>
    <text x={width / 2} y={height - 8} textAnchor="middle">Epoch</text>
  </svg><div className="chart-legend"><span><i className="train-line"/>Train</span><span><i className="val-line"/>Validation</span>{selectedEpoch && <span>Selected: {selectedEpoch}</span>}</div></div>
}

function Results({ report }) {
  if (!report) return null
  const test = report.metrics.test, baseline = report.baseline.metrics.test
  return <>
    <div className="metric-cards">
      <div><span>TRAIN ACCURACY</span><strong>{percent(report.metrics.train.accuracy)}</strong><small>{report.metrics.train.count.toLocaleString()} objects</small></div>
      <div><span>VALIDATION</span><strong>{percent(report.metrics.validation.accuracy)}</strong><small>{report.metrics.validation.count} objects</small></div>
      <div className="highlight-metric"><span>HELD-OUT TEST</span><strong>{percent(test.accuracy)}</strong><small>{test.count} objects · F1 {test.macro_f1.toFixed(3)}</small></div>
      <div><span>SHALLOW BASELINE</span><strong>{percent(baseline.accuracy)}</strong><small>Logistic regression</small></div>
    </div>
    <div className="evaluation-details">
      <div><h4>Test errors: MLP vs. shallow model</h4><p className="comparison"><strong>{Math.round((1 - test.accuracy) * test.count)}</strong> / {test.count} <span>vs.</span> <strong>{Math.round((1 - baseline.accuracy) * baseline.count)}</strong> / {baseline.count}</p><p className="learning-copy">Same inputs and data splits. Baseline regularization and MLP checkpoint selected using validation loss.</p><p className="learning-copy">Test loss: {test.loss.toFixed(4)} · Baseline: {baseline.loss.toFixed(4)}</p></div>
      <div className="confusion-wrap"><h4>Test confusion matrix</h4><p className="learning-copy">Rows: actual · Columns: predicted</p><table className="confusion-table"><thead><tr><th/><th title="Ellipsoid">Ell.</th><th title="Cuboid">Cub.</th><th title="Cylinder">Cyl.</th><th title="Torus">Tor.</th></tr></thead><tbody>{test.confusion_matrix.map((row, i) => <tr key={i}><th>{classes[i]}</th>{row.map((value, j) => <td key={j} className={i === j ? 'diagonal' : value ? 'misclassified' : ''}>{value}</td>)}</tr>)}</tbody></table></div>
    </div>
  </>
}

export function TrainingLab({ learning }) {
  const [config, setConfig] = useState({ learning_rate: .03, epochs: 160, hidden_units: 48, hidden_layers: 2, activation: 'relu', seed: 42 })
  const [showRun, setShowRun] = useState(true)
  const { model, job, running } = learning
  const currentRun = showRun && job
  const report = currentRun ? job.report : model?.report
  const history = currentRun ? job.history : model?.report.history
  function field(key, value) { setConfig(c => ({ ...c, [key]: value })) }
  return <section className="training-lab" aria-label="Training laboratory">
    <div className="lab-title"><div><div className="eyebrow">EXPERIMENT / LEARN FROM GEOMETRY</div><h2>Training laboratory</h2><p>Small network. Visible learning. Reproducible results.</p></div><span className="lab-badge">CPU · PYTORCH</span></div>
    <div className="architecture-card"><span>ACTIVE NETWORK</span><strong>{model?.report.architecture.join(' → ') || 'Connecting…'}</strong><p>{model ? `${model.report.config.activation.toUpperCase()} hidden layers · ${model.report.parameter_count.toLocaleString()} parameters · ${model.id === 'reference' ? 'submitted reference weights' : `run ${model.id}`}` : 'Start the backend to connect the trained model.'}</p></div>
    <form className="training-controls" onSubmit={e => { e.preventDefault(); setShowRun(true); learning.start(config) }}>
      <label>Learning rate<input aria-label="Learning rate" type="number" min="0.001" max="0.2" step="0.001" required value={config.learning_rate} onChange={e => field('learning_rate', e.target.value === '' ? '' : Number(e.target.value))} disabled={running}/></label>
      <label>Epochs<input aria-label="Epochs" type="number" min="5" max="300" required value={config.epochs} onChange={e => field('epochs', e.target.value === '' ? '' : Number(e.target.value))} disabled={running}/></label>
      <label>Hidden units<select aria-label="Hidden units" value={config.hidden_units} onChange={e => field('hidden_units', Number(e.target.value))} disabled={running}>{[16, 32, 48, 64, 128].map(n => <option key={n}>{n}</option>)}</select></label>
      <label>Hidden layers<select aria-label="Hidden layers" value={config.hidden_layers} onChange={e => field('hidden_layers', Number(e.target.value))} disabled={running}>{[1, 2, 3].map(n => <option key={n}>{n}</option>)}</select></label>
      <label>Activation<select aria-label="Activation" value={config.activation} onChange={e => field('activation', e.target.value)} disabled={running}><option value="relu">ReLU</option><option value="tanh">Tanh</option></select></label>
      <div className="training-actions"><button className="primary-button" type="submit" disabled={running || !model}>{running ? 'Training…' : 'Train new model'}</button>{running && <button className="text-button" type="button" onClick={learning.cancel}>Cancel</button>}</div>
    </form>
    <p className="scope-note">SGD · cross-entropy · batch size 64 · seed {config.seed}. Standardization uses training data only. Each run starts from new weights. Test metrics appear after training, never during checkpoint selection.</p>
    {learning.error && <div role="alert" className="learning-error">{learning.error}<button className="text-button" onClick={learning.refresh}>Reconnect model</button></div>}
    <div className="run-toolbar"><div className="run-tabs"><button className={!currentRun ? 'selected' : ''} onClick={() => setShowRun(false)}>Active model results</button><button className={currentRun ? 'selected' : ''} disabled={!job} onClick={() => setShowRun(true)}>Latest training run</button></div>{currentRun && <span className="run-status" role="status">{job.status} · epoch {job.history.at(-1)?.epoch ?? 0}/{job.config.epochs}</span>}</div>
    {currentRun && <div className="training-progress"><div style={{ width: `${100 * (job.history.at(-1)?.epoch || 0) / job.config.epochs}%` }}/></div>}
    <div className="learning-charts"><Chart history={history} metric="loss" title="Loss vs. epoch" selectedEpoch={report?.best_epoch}/><Chart history={history} metric="accuracy" title="Accuracy vs. epoch" selectedEpoch={report?.best_epoch}/></div>
    {currentRun && !report && <p className="learning-copy">{['cancelled', 'failed', 'disconnected'].includes(job.status) ? 'This run has no completed evaluation. The active model is unchanged.' : 'Live train/validation metrics. Held-out test evaluation will follow completion.'}</p>}
    <Results report={report}/>
    <div className="model-actions">{job?.status === 'completed' && model?.id !== job.id && <button className="primary-button" onClick={() => learning.activate(job.id)}>Use trained model for predictions</button>}{model && model.id !== 'reference' && <button className="outline-button" onClick={() => learning.activate('reference')}>Restore reference model</button>}</div>
    <div className="lab-footnote"><strong>What these results mean</strong><p>2,600 independently generated meshes: 1,600 train / 400 validation / 600 test. Shapes vary in proportion, orientation, scale and small surface noise. Strong results here do not establish performance on arbitrary scans, incomplete meshes or other shape families.</p></div>
  </section>
}
