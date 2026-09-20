# Three-minute demo outline

**0:00–0:25 — Data and goal.** “This project views 3D triangle meshes. The bundled model is a synthetic example with a small surface depression; I can replace it with my own OBJ or STL research mesh. This viewer is a starting point for later classification, defect detection, or segmentation.”

**0:25–1:10 — Basic interaction.** Show the sample model. Rotate with left drag, pan with right drag, zoom with the wheel. Toggle wireframe, point out the vertex and triangle counts, and reset the camera.

**1:10–2:15 — Annotation.** Choose **Add surface marker**, click a visible surface feature, select **Defect**, enter a short title and note, and save. Show the marker in the 3D view and list. Reload the page and show that the marker persists.

**2:15–2:40 — Backend.** Point to “Annotations saved in SQLite database” in the inspector. Briefly show the local API docs at `localhost:8000/docs` or the `backend/data/mesh_atlas.db` file. This demonstrates database integration.

**2:40–3:00 — Extensibility.** Open the upload control and explain that personal OBJ/STL data can replace the example. Mention that future assignments can add a model prediction panel and per-face labels.

Before recording, start **both** the backend and frontend using the README commands and make sure the inspector says **SQLite database**. Keep the recording under three minutes.
