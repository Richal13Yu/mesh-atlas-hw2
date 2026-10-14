"""Regression checks for real geometry, saved weights, data isolation and GUI APIs."""
import hashlib
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import numpy as np
import torch
import trimesh

from backend.app import app
from backend.learning import ModelService, load_artifact
from training.dataset import ROOT, CLASSES, make_mesh
from training.features import extract_features
from training.train import load_data


class DataAndModelTest(unittest.TestCase):
    def test_split_independence_and_train_only_scaler(self):
        data = load_data()
        manifest = json.loads((ROOT / 'data/manifest.json').read_text())
        all_seeds, all_hashes = [], []
        for split in ['train', 'validation', 'test']:
            all_seeds.extend(data[f'{split}_seeds'].tolist())
            all_hashes.extend(manifest['splits'][split]['geometry_sha256'])
            self.assertEqual(len(set(np.bincount(data[f'{split}_y']))), 1)
        self.assertEqual(len(all_seeds), len(set(all_seeds)))
        self.assertEqual(len(all_hashes), len(set(all_hashes)))
        _, checkpoint, report = load_artifact(ROOT / 'artifacts/reference')
        np.testing.assert_allclose(checkpoint['mean'], data['train_x'].mean(0))
        np.testing.assert_allclose(checkpoint['scale'], np.maximum(data['train_x'].std(0), 1e-6))
        self.assertGreater(report['weight_change_l2'], 0.1)
        self.assertLess(report['history'][-1]['train_loss'], report['history'][0]['train_loss'])
        self.assertGreater(report['metrics']['test']['accuracy'], report['baseline']['metrics']['test']['accuracy'])

    def test_geometric_invariance_and_regeneration(self):
        mesh = make_mesh(3, 11000)
        base = extract_features(mesh.triangles)
        q, _ = np.linalg.qr(np.random.default_rng(0).normal(size=(3, 3)))
        transformed = mesh.triangles @ q * 7.3 + [14, -9, 80]
        np.testing.assert_allclose(base, extract_features(transformed), atol=1e-5)
        data = load_data()
        actual = make_mesh(int(data['train_y'][0]), int(data['train_seeds'][0]))
        np.testing.assert_allclose(extract_features(actual.triangles), data['train_x'][0], atol=1e-6)


class LearningApiTest(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.env = patch.dict(os.environ, {'MESH_ATLAS_DB': str(Path(self.temp.name) / 'test.db')})
        self.env.start()
        self.service = ModelService()
        self.service_patch = patch('backend.learning.service', self.service)
        self.service_patch.start()
        self.client = TestClient(app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.service.shutdown()
        self.service_patch.stop()
        self.env.stop()
        self.temp.cleanup()

    def test_predictions_use_real_geometry_and_support_stl(self):
        for label in CLASSES:
            mesh = trimesh.load(ROOT / f'public/examples/{label.lower()}.obj', force='mesh', process=False)
            response = self.client.post('/api/predict', json={'triangles': mesh.triangles.flatten().tolist()})
            self.assertEqual(response.status_code, 200, response.text)
            result = response.json()
            self.assertEqual(result['class_name'], label)
            self.assertAlmostEqual(sum(p['probability'] for p in result['probabilities']), 1., places=5)
        mesh = trimesh.load(ROOT / 'public/examples/cuboid.stl', force='mesh', process=False)
        self.assertEqual(self.client.post('/api/predict', json={'triangles': mesh.triangles.flatten().tolist()}).json()['class_name'], 'Cuboid')

    def test_bad_inputs_and_unknown_run(self):
        for triangles in [[], [0] * 9, [0] * 10, ['NaN'] * 9]:
            self.assertEqual(self.client.post('/api/predict', json={'triangles': triangles}).status_code, 422)
        self.assertEqual(self.client.post('/api/training', json={'epochs': 0}).status_code, 422)
        self.assertEqual(self.client.post('/api/training', json={'hidden_layers': 0}).status_code, 422)
        self.assertEqual(self.client.get('/api/training/missing').status_code, 404)
        self.assertEqual(self.client.post('/api/model/activate/missing').status_code, 404)

    def test_training_monitor_checkpoint_activation_and_reference_restore(self):
        reference = ROOT / 'artifacts/reference/model.pt'
        before = hashlib.sha256(reference.read_bytes()).hexdigest()
        response = self.client.post('/api/training', json={'epochs': 12, 'hidden_units': 16, 'hidden_layers': 1, 'activation': 'tanh'})
        self.assertEqual(response.status_code, 202)
        run_id = response.json()['id']
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            result = self.client.get(f'/api/training/{run_id}').json()
            if result['status'] in ['completed', 'failed']:
                break
            time.sleep(.02)
        self.assertEqual(result['status'], 'completed', result)
        self.assertEqual(len(result['history']), 13)
        self.assertEqual(result['report']['architecture'], [24, 16, 4])
        self.assertEqual(self.client.get('/api/model').json()['id'], 'reference')
        activated = self.client.post(f'/api/model/activate/{run_id}').json()
        self.assertEqual(activated['id'], run_id)
        self.assertEqual(activated['report']['metrics'], result['report']['metrics'])
        self.assertEqual(self.client.post('/api/model/activate/reference').json()['id'], 'reference')
        self.assertEqual(before, hashlib.sha256(reference.read_bytes()).hexdigest())

    def test_concurrent_run_rejected_and_cancel_keeps_reference(self):
        # Gate the worker at its first update so cancel/concurrency are deterministic.
        import threading
        from training.train import train as real_train
        entered, release = threading.Event(), threading.Event()
        def gated_train(*args, **kwargs):
            entered.set()
            release.wait(5)
            return real_train(*args, **kwargs)
        with patch('backend.learning.train', gated_train):
            response = self.client.post('/api/training', json={'epochs': 10})
            run_id = response.json()['id']
            self.assertTrue(entered.wait(5))
            try:
                self.assertEqual(self.client.post('/api/training', json={}).status_code, 409)
                self.assertEqual(self.client.post(f'/api/model/activate/{run_id}').status_code, 409)
                self.assertEqual(self.client.post(f'/api/training/{run_id}/cancel').json()['status'], 'cancelling')
            finally:
                release.set()
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                status = self.client.get(f'/api/training/{run_id}').json()['status']
                if status == 'cancelled': break
                time.sleep(.02)
            self.assertEqual(status, 'cancelled')
            self.assertEqual(self.client.get('/api/model').json()['id'], 'reference')


if __name__ == '__main__':
    unittest.main()
