// Record a short live-browser walkthrough. Start the frontend and backend first.
import fs from 'node:fs'
import { chromium } from 'playwright'

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'],
})
fs.mkdirSync('/tmp/mesh-atlas-captures', { recursive: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: '/tmp/mesh-atlas-captures', size: { width: 1440, height: 900 } },
})
const page = await context.newPage()
const pause = (ms) => page.waitForTimeout(ms)

async function addOverlay() {
  await page.evaluate(() => {
    document.querySelector('#demo-caption')?.remove()
    document.querySelector('#demo-cursor')?.remove()
    const caption = document.createElement('div')
    caption.id = 'demo-caption'
    Object.assign(caption.style, {
      position: 'fixed', left: '300px', top: '265px', maxWidth: '500px',
      padding: '10px 15px', background: '#07121de8', color: '#f2e6da',
      border: '1px solid #d8a27e', borderRadius: '5px', zIndex: '9999',
      font: '600 16px Arial, sans-serif', pointerEvents: 'none',
      boxShadow: '0 5px 20px #0008',
    })
    document.body.appendChild(caption)
    const cursor = document.createElement('div')
    cursor.id = 'demo-cursor'
    Object.assign(cursor.style, {
      position: 'fixed', width: '18px', height: '18px', borderRadius: '50%',
      border: '2px solid #fff', background: '#d8a27e99', zIndex: '10000',
      pointerEvents: 'none', transform: 'translate(-100px,-100px)',
      boxShadow: '0 0 0 4px #d8a27e55',
    })
    document.body.appendChild(cursor)
  })
}

async function caption(text) {
  if (!await page.locator('#demo-caption').count()) await addOverlay()
  await page.locator('#demo-caption').evaluate((el, value) => { el.textContent = value }, text)
}

async function move(x, y) {
  await page.mouse.move(x, y)
  if (!await page.locator('#demo-cursor').count()) await addOverlay()
  await page.locator('#demo-cursor').evaluate((el, point) => {
    el.style.transform = `translate(${point.x - 9}px, ${point.y - 9}px)`
  }, { x, y })
}

async function clickButton(locator) {
  const box = await locator.boundingBox()
  if (box) await move(box.x + box.width / 2, box.y + box.height / 2)
  await pause(300)
  await locator.click()
}

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: 'sample-surface.obj' }).waitFor()
await page.locator('.storage-status').getByText('SQLite database').waitFor()
await addOverlay()
await caption('Mesh Atlas: a 3D research data viewer')
await pause(4500)
await caption('The bundled OBJ is synthetic; personal OBJ and STL meshes can be opened.')
await pause(4200)

const canvas = page.locator('canvas')
let box = await canvas.boundingBox()
await caption('Rotate the model by dragging; inspect the surface from any angle.')
await move(box.x + box.width * .49, box.y + box.height * .52)
await page.mouse.down()
for (let i = 1; i <= 22; i++) {
  await move(box.x + box.width * .49 + i * 5, box.y + box.height * .52 + i * 1.5)
  await pause(90)
}
await page.mouse.up()
await pause(2200)

await caption('Scroll to zoom. Right-drag pans the model.')
await page.mouse.wheel(0, -410)
await pause(1500)
await page.mouse.down({ button: 'right' })
for (let i = 1; i <= 16; i++) {
  await move(box.x + box.width * .60 - i * 2, box.y + box.height * .58 + i * 1.5)
  await pause(75)
}
await page.mouse.up({ button: 'right' })
await pause(1600)

await caption('The inspector reports mesh geometry; wireframe reveals the triangles.')
await clickButton(page.getByRole('button', { name: 'Wireframe' }))
await pause(3500)
await clickButton(page.getByRole('button', { name: 'Reset view' }))
await clickButton(page.getByRole('button', { name: 'Wireframe' }))
await pause(1000)

await caption('Add a typed annotation by clicking a point on the surface.')
await clickButton(page.getByRole('button', { name: 'Add surface marker' }))
box = await canvas.boundingBox()
await move(box.x + box.width * .52, box.y + box.height * .48)
await pause(400)
await page.mouse.click(box.x + box.width * .52, box.y + box.height * .48)
await page.locator('.annotation-form').waitFor()
await page.locator('select').selectOption('defect')
await page.getByPlaceholder('e.g. edge defect').fill('Surface depression')
await page.getByPlaceholder('Describe this point…').fill('Localized shape irregularity for later defect detection.')
await pause(1200)
await clickButton(page.getByRole('button', { name: 'Save marker' }))
await page.locator('.annotation-item').first().waitFor()
await pause(2500)

await caption('The marker appears on the mesh and in the annotation list.')
await pause(2800)
await caption('Reloading retrieves the saved marker from the SQLite database.')
await pause(1800)
await page.reload({ waitUntil: 'networkidle' })
await page.evaluate(() => window.scrollTo(0, 0))
await page.getByRole('heading', { name: 'sample-surface.obj' }).waitFor()
await page.locator('.annotation-item').first().waitFor()
await addOverlay()
await caption('Marker restored after reload — persisted through FastAPI + SQLite.')
await clickButton(page.locator('.annotation-item').first())
await pause(2700)
await caption('Import a local STL mesh to inspect a different dataset.')
await page.locator('input[type=file]').setInputFiles({
  name: 'demo-cube.stl', mimeType: 'application/sla',
  buffer: fs.readFileSync(new URL('../samples/demo-cube.stl', import.meta.url)),
})
await page.getByRole('heading', { name: 'demo-cube.stl' }).waitFor()
await pause(3000)
await caption('Ready for future mesh classification, defect detection, and segmentation.')
await pause(3600)

const video = page.video()
await context.close()
console.log(await video.path())
await browser.close()
