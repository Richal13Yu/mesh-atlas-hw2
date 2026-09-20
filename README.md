# Mesh Atlas — DS7400 HW1

Mesh Atlas is a web viewer for **3D triangle meshes**. It is the foundation for a future research tool for mesh classification, surface defect detection, and segmentation. The included OBJ is synthetic demonstration data, not a real research scan. You can replace it with your own OBJ or STL file using the upload button.

## What it does

- Opens OBJ and STL models in the browser, including binary STL.
- Lets you **rotate** (left drag), **pan** (right drag), and **zoom** (scroll); reset the camera and toggle wireframe.
- Displays vertex, triangle, mesh, and bounding-size information.
- Lets you click a surface point and attach a typed label, title, and note. Markers appear on the model and in a selectable list; they can be deleted.
- Saves dataset metadata and annotations to a local **FastAPI + SQLite** backend. If the backend is not running, annotations are saved in this browser's local storage instead. The inspector shows which storage is active.

The original model files are read locally by the browser and are **not uploaded to the backend**. The database stores mesh metadata and marker coordinates in a normalized viewing coordinate system. Uploaded models are centered and scaled for viewing; their displayed bounding dimensions are in the file's original units (which OBJ/STL do not define).

## Run locally

Requirements: Node.js 20.19+ or 22.12+, npm, and Python 3.10+.

In terminal 1, from this folder:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn app:app --app-dir backend --reload --port 8000
```

In terminal 2, from this folder:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually <http://localhost:5173>. The backend API docs are at <http://localhost:8000/docs>. The `backend/data/mesh_atlas.db` file is created automatically and ignored by Git.

Alternatively, start the backend with `docker compose up --build` and then run the frontend commands above. Docker is optional.

## Try the viewer

1. Drag the sample mesh to rotate it, right-drag to pan, and scroll to zoom.
2. Toggle **Wireframe** and use **Reset view**.
3. Select **Add surface marker**, click the mesh, enter a title and label, and save.
4. Reload the page: the marker should remain. Delete it from the annotation detail panel if desired.
5. Upload your own `.obj` or `.stl` file. Markers are associated with the file content, so reopening the same file retrieves its saved annotations.

The sample meshes can be regenerated with `python3 scripts/generate_sample.py`. The default OBJ is an ellipsoid-like closed surface with geometric texture and one localized depression to make annotation meaningful. `samples/demo-cube.stl` is a small second mesh you can use to test STL import.

## Libraries and files

- **React + Vite:** web application and development server.
- **Three.js + React Three Fiber + Drei:** model loading, 3D rendering, raycast surface picking, and camera controls.
- **FastAPI + SQLite:** local API and persistent metadata/annotations.
- `src/App.jsx`: interface and viewer interactions.
- `src/mesh.js`: OBJ/STL parsing, statistics, normalization, and model identity.
- `src/api.js`: database requests with browser-storage fallback.
- `backend/app.py`: API and database schema.

## Scope for later assignments

The data model can be extended with model predictions, per-face labels, segmentation masks, and user corrections. HW1 deliberately contains no deep learning model.

## Submission

Canvas asks for a GitHub repository link and a live demo video of at most 3 minutes. This folder contains the source and README; publish it to **your own GitHub repository** and record the demo before submitting. The included [DEMO_SCRIPT.md](DEMO_SCRIPT.md) has a short walkthrough.
