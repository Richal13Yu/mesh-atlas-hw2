"""Generate independent synthetic objects; no research data or external downloads."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import trimesh

from training.features import extract_features, FEATURE_NAMES, FEATURE_VERSION

ROOT = Path(__file__).resolve().parents[1]
CLASSES = ["Ellipsoid", "Cuboid", "Cylinder", "Torus"]
SPLITS = {"train": (400, 11000), "validation": (100, 22000), "test": (150, 33000)}


def make_mesh(class_index, seed):
    rng = np.random.default_rng(seed)
    if class_index == 0:
        mesh = trimesh.creation.icosphere(subdivisions=2)
    elif class_index == 1:
        mesh = trimesh.creation.box()
    elif class_index == 2:
        mesh = trimesh.creation.cylinder(radius=1, height=2, sections=48)
    elif class_index == 3:
        mesh = trimesh.creation.torus(major_radius=1, minor_radius=rng.uniform(.22, .48),
                                     major_sections=48, minor_sections=24)
    else:
        raise ValueError("Unknown class")
    # Broad, overlapping aspect ratios make simple thresholds insufficient.
    mesh.vertices *= rng.uniform(.55, 1.65, size=3)
    mesh.vertices += rng.normal(0, rng.uniform(0, .012), mesh.vertices.shape)
    # Random orthogonal rotation, uniform scale, and translation are nuisance variables.
    rotation, _ = np.linalg.qr(rng.normal(size=(3, 3)))
    mesh.vertices = mesh.vertices @ rotation * rng.uniform(.5, 3) + rng.uniform(-5, 5, size=3)
    return mesh


def generate(output=ROOT / "data"):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    arrays, split_info = {}, {}
    for split, (per_class, base_seed) in SPLITS.items():
        x, y, seeds, hashes = [], [], [], []
        for label in range(len(CLASSES)):
            for i in range(per_class):
                seed = base_seed + label * 1000 + i
                mesh = make_mesh(label, seed)
                x.append(extract_features(mesh.triangles))
                y.append(label)
                seeds.append(seed)
                hashes.append(hashlib.sha256(mesh.triangles.tobytes()).hexdigest())
        arrays[f"{split}_x"] = np.stack(x)
        arrays[f"{split}_y"] = np.array(y, dtype=np.int64)
        arrays[f"{split}_seeds"] = np.array(seeds, dtype=np.int64)
        split_info[split] = {"size": len(y), "per_class": per_class,
                             "seed_range": [min(seeds), max(seeds)], "geometry_sha256": hashes}
        print(f"Generated {split}: {len(y)} independent objects", flush=True)
    np.savez_compressed(output / "features.npz", **arrays)
    metadata = {"classes": CLASSES, "feature_version": FEATURE_VERSION,
                "features": FEATURE_NAMES, "splits": split_info,
                "note": "Synthetic primitive families only. Splits are separate generated objects, not views of one object."}
    (output / "manifest.json").write_text(json.dumps(metadata, indent=2) + "\n")
    # Demo examples are independent of all splits, with known procedural labels.
    examples = ROOT / "public" / "examples"
    examples.mkdir(parents=True, exist_ok=True)
    for label, name in enumerate(CLASSES):
        obj_text = make_mesh(label, 44000 + label).export(file_type="obj")
        (examples / f"{name.lower()}.obj").write_text(obj_text.rstrip() + "\n")
    make_mesh(1, 44001).export(examples / "cuboid.stl")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "data")
    generate(parser.parse_args().output)
