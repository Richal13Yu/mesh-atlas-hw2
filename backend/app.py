"""Small local API for mesh metadata and surface annotations."""

from contextlib import asynccontextmanager, closing, contextmanager
from datetime import datetime, timezone
import os
from pathlib import Path
import sqlite3
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from backend.learning import router as learning_router


def database_path() -> Path:
    return Path(os.environ.get("MESH_ATLAS_DB", Path(__file__).parent / "data" / "mesh_atlas.db"))


def connect() -> sqlite3.Connection:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def database():
    with closing(connect()) as db:
        with db:
            yield db


def initialize() -> None:
    with database() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS datasets (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                vertices INTEGER NOT NULL,
                triangles INTEGER NOT NULL,
                meshes INTEGER NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS annotations (
                id TEXT PRIMARY KEY,
                dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
                x REAL NOT NULL,
                y REAL NOT NULL,
                z REAL NOT NULL,
                label TEXT NOT NULL,
                title TEXT NOT NULL,
                note TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_annotations_dataset ON annotations(dataset_id);
        """)


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize()
    yield


app = FastAPI(title="Mesh Atlas API", lifespan=lifespan)
app.include_router(learning_router)


class DatasetIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    vertices: int = Field(ge=0)
    triangles: int = Field(ge=0)
    meshes: int = Field(ge=0)


class AnnotationIn(BaseModel):
    x: float = Field(allow_inf_nan=False)
    y: float = Field(allow_inf_nan=False)
    z: float = Field(allow_inf_nan=False)
    label: Literal["feature", "defect", "reference", "other"]
    title: str = Field(min_length=1, max_length=80)
    note: str = Field(default="", max_length=1000)


@app.get("/api/health")
def health():
    return {"status": "ok", "database": str(database_path())}


@app.put("/api/datasets/{dataset_id}")
def put_dataset(dataset_id: str, dataset: DatasetIn):
    if len(dataset_id) > 150:
        raise HTTPException(400, "Dataset ID is too long")
    now = datetime.now(timezone.utc).isoformat()
    with database() as db:
        db.execute("""
            INSERT INTO datasets (id, name, vertices, triangles, meshes, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name,
                vertices=excluded.vertices, triangles=excluded.triangles,
                meshes=excluded.meshes, updated_at=excluded.updated_at
        """, (dataset_id, dataset.name, dataset.vertices, dataset.triangles, dataset.meshes, now))
    return {"id": dataset_id, "name": dataset.name}


@app.get("/api/datasets/{dataset_id}/annotations")
def list_annotations(dataset_id: str):
    with database() as db:
        rows = db.execute("SELECT id, dataset_id, x, y, z, label, title, note, created_at FROM annotations WHERE dataset_id=? ORDER BY created_at, id", (dataset_id,)).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/datasets/{dataset_id}/annotations", status_code=201)
def add_annotation(dataset_id: str, annotation: AnnotationIn):
    created = {"id": str(uuid4()), "dataset_id": dataset_id, **annotation.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()}
    with database() as db:
        if not db.execute("SELECT 1 FROM datasets WHERE id=?", (dataset_id,)).fetchone():
            raise HTTPException(404, "Dataset not registered")
        db.execute("""
            INSERT INTO annotations (id, dataset_id, x, y, z, label, title, note, created_at)
            VALUES (:id, :dataset_id, :x, :y, :z, :label, :title, :note, :created_at)
        """, created)
    return created


@app.delete("/api/annotations/{annotation_id}")
def remove_annotation(annotation_id: str):
    with database() as db:
        cursor = db.execute("DELETE FROM annotations WHERE id=?", (annotation_id,))
        if cursor.rowcount == 0:
            raise HTTPException(404, "Annotation not found")
    return {"deleted": True}
