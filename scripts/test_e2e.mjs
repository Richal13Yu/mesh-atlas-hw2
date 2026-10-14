// Requires the API and Vite server (npm start). Exercises actual browser geometry.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chromium } from 'playwright'

const browser = await chromium.launch({
  ...(process.env.CHROME_PATH || process.platform === 'darwin' ? { executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {}),
  headless: true, args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
const origin = process.env.APP_URL || 'http://127.0.0.1:5173'
fs.mkdirSync('artifacts/qa', { recursive: true })
try {
  await page.request.post(`${origin}/api/model/activate/reference`)
  await page.goto(origin, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Predict shape', exact: true }).waitFor()
  for (const shape of ['Torus', 'Ellipsoid', 'Cuboid', 'Cylinder']) {
    await page.locator('.example-buttons').getByRole('button', { name: shape, exact: true }).click()
    await page.getByRole('heading', { name: `${shape.toLowerCase()}.obj`, exact: true }).waitFor()
    await page.waitForFunction(() => document.querySelector('.prediction-result') === null)
    await page.getByRole('button', { name: 'Predict shape', exact: true }).click()
    await page.locator('.prediction-heading strong').waitFor()
    assert.equal(await page.locator('.prediction-heading strong').innerText(), shape)
  }
  // A misleading filename must not change the prediction: the API sees only triangles.
  await page.locator('input[type=file]').setInputFiles({ name: 'not-a-torus.stl', mimeType: 'application/sla', buffer: fs.readFileSync('public/examples/cuboid.stl') })
  await page.getByRole('heading', { name: 'not-a-torus.stl' }).waitFor()
  await page.getByRole('button', { name: 'Predict shape', exact: true }).click()
  await page.locator('.prediction-heading strong').waitFor()
  assert.equal(await page.locator('.prediction-heading strong').innerText(), 'Cuboid')
  await page.screenshot({ path: 'artifacts/qa/stl-prediction.png', fullPage: true })
  // Keep HW1 surface picking and persistence working.
  await page.getByRole('button', { name: 'Add surface marker', exact: true }).click()
  const box = await page.locator('canvas').boundingBox()
  await page.mouse.click(box.x + box.width * .5, box.y + box.height * .5)
  await page.locator('.annotation-form').waitFor()
  await page.getByPlaceholder('e.g. edge defect').fill('HW2 test marker')
  await page.getByRole('button', { name: 'Save marker', exact: true }).click()
  await page.locator('.annotation-item').filter({ hasText: 'HW2 test marker' }).waitFor()
  const datasetId = (await page.locator('.storage-status').innerText()).includes('SQLite')
  assert.ok(datasetId, 'Annotations must be saved in SQLite')
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('input[type=file]').setInputFiles({ name: 'not-a-torus.stl', mimeType: 'application/sla', buffer: fs.readFileSync('public/examples/cuboid.stl') })
  await page.locator('.annotation-item').filter({ hasText: 'HW2 test marker' }).click()
  await page.getByRole('button', { name: 'Delete annotation', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.annotation-item'))
  await page.getByRole('button', { name: '02 Training lab', exact: true }).click()
  await page.getByLabel('Epochs', { exact: true }).fill('80')
  await page.getByLabel('Hidden units', { exact: true }).selectOption('32')
  await page.getByLabel('Hidden layers', { exact: true }).selectOption('1')
  await page.getByLabel('Activation', { exact: true }).selectOption('tanh')
  await page.getByRole('button', { name: 'Train new model', exact: true }).click()
  await page.getByRole('button', { name: 'Use trained model for predictions', exact: true }).waitFor({ timeout: 30000 })
  assert.match(await page.locator('.run-status').innerText(), /completed.*80\/80/i)
  await page.getByRole('button', { name: 'Use trained model for predictions', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.architecture-card strong')?.textContent === '24 → 32 → 4')
  await page.getByRole('button', { name: 'Predict shape', exact: true }).click()
  await page.locator('.prediction-heading strong').waitFor()
  assert.ok(!(await page.locator('.model-caption').innerText()).includes('submitted reference'))
  await page.getByRole('button', { name: 'Restore reference model', exact: true }).click()
  await page.getByRole('button', { name: 'Active model results', exact: true }).click()
  await page.screenshot({ path: 'artifacts/qa/training.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'artifacts/qa/mobile.png', fullPage: true })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile page must not overflow horizontally')
  // Network failure is visible and never replaced by invented predictions.
  await page.route('**/api/predict', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Service temporarily unavailable' }) }))
  await page.getByRole('button', { name: 'Predict shape', exact: true }).click()
  await page.locator('.prediction-panel [role=alert]').waitFor()
  assert.equal(await page.locator('.prediction-result').count(), 0)
  assert.deepEqual(errors, [], 'No browser JavaScript exceptions')
  console.log('PASS: four shapes, misleading STL filename, annotation persistence, interactive training, model activation, reference restore, mobile layout, network failure.')
} finally {
  await page.request.post(`${origin}/api/model/activate/reference`)
  await browser.close()
}
