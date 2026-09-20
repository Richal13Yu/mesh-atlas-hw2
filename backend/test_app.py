"""Exercise dataset registration and persisted annotation operations."""

import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from fastapi.testclient import TestClient

from app import app


class ApiTest(unittest.TestCase):
    def test_annotation_lifecycle(self):
        with TemporaryDirectory() as folder:
            os.environ["MESH_ATLAS_DB"] = str(Path(folder) / "test.db")
            try:
                with TestClient(app) as client:
                    self.assertEqual(client.get("/api/health").status_code, 200)
                    registered = client.put("/api/datasets/test-mesh", json={
                        "name": "example.obj", "vertices": 15, "triangles": 5, "meshes": 1,
                    })
                    self.assertEqual(registered.status_code, 200)
                    created = client.post("/api/datasets/test-mesh/annotations", json={
                        "x": 0.2, "y": -0.4, "z": 0.8,
                        "label": "defect", "title": "Small dent", "note": "Review later",
                    })
                    self.assertEqual(created.status_code, 201)
                    annotation_id = created.json()["id"]
                    listed = client.get("/api/datasets/test-mesh/annotations").json()
                    self.assertEqual(len(listed), 1)
                    self.assertEqual(listed[0]["title"], "Small dent")

                with TestClient(app) as client:
                    self.assertEqual(client.get("/api/datasets/test-mesh/annotations").json()[0]["id"], annotation_id)
                    self.assertEqual(client.delete(f"/api/annotations/{annotation_id}").status_code, 200)
                    self.assertEqual(client.get("/api/datasets/test-mesh/annotations").json(), [])
            finally:
                os.environ.pop("MESH_ATLAS_DB", None)


if __name__ == "__main__":
    unittest.main()
