// Record the actual running app. Optional timing file adds synchronized narration.
// Start npm start first. On macOS use say + ffmpeg to prepare audio from demo_scenes.json.
import fs from 'node:fs'
import { performance } from 'node:perf_hooks'
import { chromium } from 'playwright'
const dir = 'artifacts/demo-raw'
fs.mkdirSync(dir, { recursive: true })
const scenes = JSON.parse(fs.readFileSync(fs.existsSync(`${dir}/scenes.json`) ? `${dir}/scenes.json` : 'scripts/demo_scenes.json', 'utf8'))
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir, size: { width: 1440, height: 1000 } } })
const page = await context.newPage()
const started = performance.now()
const timeline = []
const errors = []
page.on('pageerror', error => errors.push(error.message))
const pause = ms => page.waitForTimeout(ms)
const origin = process.env.APP_URL || 'http://127.0.0.1:5173'
async function click(locator) {
  await locator.scrollIntoViewIfNeeded()
  const b = await locator.boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
  await pause(250)
  await locator.click()
  await page.screenshot() // Force a compositor update after WebGL view transitions.
}
async function predict() {
  await click(page.getByRole('button', { name: 'Predict shape', exact: true }))
  await page.locator('.prediction-result').waitFor()
}
async function example(name) {
  await click(page.locator('.example-buttons').getByRole('button', { name, exact: true }))
  await page.getByRole('heading', { name: `${name.toLowerCase()}.obj`, exact: true }).waitFor()
}
async function scene(id, action) {
  const spec = scenes.find(s => s.id === id)
  await page.evaluate(caption => {
    let node = document.getElementById('demo-caption')
    if (!node) {
      node = document.createElement('div'); node.id = 'demo-caption'
      Object.assign(node.style, { position: 'fixed', bottom: '15px', left: '240px', right: '325px', zIndex: '10000', padding: '14px 18px', background: '#07141cf5', color: '#f3ebdb', border: '1px solid #bd9f78', borderRadius: '7px', font: '500 17px/1.45 Arial,sans-serif', textAlign: 'center', pointerEvents: 'none', boxShadow: '0 6px 24px #0008' })
      document.body.appendChild(node)
    }
    node.textContent = caption
  }, spec.caption)
  const begin = performance.now()
  timeline.push({ id, start: (begin - started) / 1000, duration: spec.duration || spec.text.split(/\s+/).length / 2.8 })
  await action()
  const remaining = (spec.duration || spec.text.split(/\s+/).length / 2.8) * 1000 + 1000 - (performance.now() - begin)
  if (remaining > 0) await pause(remaining)
  console.log(`Recorded ${id}`)
}
try {
  await page.request.post(`${origin}/api/model/activate/reference`)
  await page.goto(origin, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'torus.obj' }).waitFor()
  await page.evaluate(() => {
    const timer = document.createElement('div')
    Object.assign(timer.style, { position: 'fixed', right: '19px', bottom: '15px', zIndex: '9999', color: '#a6cdb8', background: '#0b1b24ee', padding: '6px 9px', borderRadius: '4px', font: '10px monospace', pointerEvents: 'none' })
    document.body.appendChild(timer)
    const start = Date.now()
    setInterval(() => { const seconds = Math.floor((Date.now() - start) / 1000); timer.textContent = `LIVE DEMO · ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` }, 250)
  })
  await scene('intro', async () => {
    const b = await page.locator('canvas').boundingBox()
    await page.mouse.move(b.x + b.width * .5, b.y + b.height * .5)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width * .6, b.y + b.height * .55, { steps: 40 })
    await page.mouse.up()
    await pause(1200)
    await click(page.getByRole('button', { name: 'Wireframe', exact: true }))
    await pause(2200)
    await click(page.getByRole('button', { name: 'Wireframe', exact: true }))
  })
  await scene('predict', predict)
  await scene('examples', async () => {
    await example('Ellipsoid'); await predict(); await pause(3200)
    await example('Cylinder'); await predict()
  })
  await scene('upload', async () => {
    await page.locator('input[type=file]').setInputFiles('public/examples/cuboid.stl')
    await page.getByRole('heading', { name: 'cuboid.stl', exact: true }).waitFor()
    await predict()
  })
  await scene('architecture', async () => {
    await click(page.getByRole('button', { name: '02 Training lab', exact: true }))
    await page.getByRole('heading', { name: 'Training laboratory', exact: true }).waitFor()
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
    await page.screenshot()
  })
  await scene('results', async () => {
    await page.locator('.learning-charts').evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  })
  await scene('train', async () => {
    await page.locator('.training-controls').evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'smooth' }))
    await page.getByLabel('Learning rate', { exact: true }).fill('0.02')
    await page.getByLabel('Epochs', { exact: true }).fill('300')
    await page.getByLabel('Hidden units', { exact: true }).selectOption('128')
    await page.getByLabel('Hidden layers', { exact: true }).selectOption('3')
    await pause(1500)
    await click(page.getByRole('button', { name: 'Train new model', exact: true }))
    await page.locator('.learning-charts').evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'smooth' }))
    await page.getByRole('button', { name: 'Use trained model for predictions', exact: true }).waitFor({ timeout: 60000 })
  })
  await scene('activate', async () => {
    await click(page.getByRole('button', { name: 'Use trained model for predictions', exact: true }))
    await pause(1200)
    await click(page.getByRole('button', { name: '01 Explore & predict', exact: true }))
    await predict()
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }))
  })
  await scene('limits', async () => {
    await click(page.getByRole('button', { name: '02 Training lab', exact: true }))
    await click(page.getByRole('button', { name: 'Restore reference model', exact: true }))
    await click(page.getByRole('button', { name: 'Active model results', exact: true }))
    await page.locator('.learning-charts').evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  })
  if (errors.length) throw new Error(errors.join('\n'))
  fs.writeFileSync(`${dir}/timeline.json`, JSON.stringify(timeline, null, 2))
  const video = page.video()
  await context.close()
  const output = await video.path()
  fs.writeFileSync(`${dir}/video-path.txt`, output)
  console.log(output)
} finally {
  await browser.close()
}
