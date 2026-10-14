"""The SAME geometry-only preprocessing is used for training and API inference."""
import numpy as np

FEATURE_NAMES = (
    [f"covariance_fraction_{i}" for i in range(3)]
    + [f"radius_q{i}" for i in range(10, 100, 10)]
    + [f"pca_kurtosis_{i}" for i in range(3)]
    + [f"pair_distance_q{i}" for i in range(10, 100, 10)]
)
FEATURE_VERSION = "surface24-v1"
SAMPLE_COUNT = 1024


def surface_points(triangles, seed=0):
    """Area-weighted barycentric samples; vertex density cannot reveal the class."""
    triangles = np.asarray(triangles, dtype=np.float64)
    if triangles.ndim != 3 or triangles.shape[1:] != (3, 3):
        raise ValueError("Expected triangle coordinates with shape (N, 3, 3).")
    if not len(triangles) or not np.isfinite(triangles).all():
        raise ValueError("Mesh coordinates must be finite and nonempty.")
    # Normalize before cross products to avoid overflow for very large source units.
    low = triangles.min(axis=(0, 1))
    span = (triangles.max(axis=(0, 1)) - low).max()
    if not np.isfinite(span) or span <= 0:
        raise ValueError("Mesh has no usable extent.")
    triangles = (triangles - low) / span
    areas = np.linalg.norm(np.cross(triangles[:, 1] - triangles[:, 0],
                                    triangles[:, 2] - triangles[:, 0]), axis=1)
    if not np.isfinite(areas.sum()) or areas.sum() < 1e-12:
        raise ValueError("Mesh has no nondegenerate surface triangles.")
    rng = np.random.default_rng(seed)
    faces = triangles[rng.choice(len(triangles), SAMPLE_COUNT, p=areas / areas.sum())]
    u = np.sqrt(rng.random((SAMPLE_COUNT, 1)))
    v = rng.random((SAMPLE_COUNT, 1))
    return (1 - u) * faces[:, 0] + u * (1 - v) * faces[:, 1] + u * v * faces[:, 2]


def extract_features(triangles):
    points = surface_points(triangles)
    points -= points.mean(axis=0)
    points /= np.sqrt(np.mean(np.sum(points * points, axis=1)))
    eigenvalues, axes = np.linalg.eigh(points.T @ points / len(points))
    order = np.argsort(eigenvalues)[::-1]
    eigenvalues, axes = eigenvalues[order], axes[:, order]
    radius = np.linalg.norm(points, axis=1)
    projected = points @ axes
    kurtosis = np.mean(projected ** 4, axis=0) / np.maximum(eigenvalues ** 2, 1e-10)
    distance = np.linalg.norm(points[:SAMPLE_COUNT // 2] - points[SAMPLE_COUNT // 2:], axis=1)
    q = np.arange(.1, 1, .1)
    features = np.concatenate([eigenvalues / eigenvalues.sum(), np.quantile(radius, q),
                               kurtosis, np.quantile(distance, q)]).astype(np.float32)
    if not np.isfinite(features).all():
        raise ValueError("Cannot extract finite shape descriptors from this mesh.")
    return features
