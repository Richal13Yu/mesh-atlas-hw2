"""Local model service and one background training job at a time."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
from pathlib import Path
from threading import Event, RLock
from uuid import uuid4

from fastapi import APIRouter, HTTPException
import numpy as np
from pydantic import BaseModel, Field, FiniteFloat, model_validator
import torch

from training.dataset import ROOT
from training.features import extract_features, FEATURE_VERSION
from training.model import MeshMLP
from training.train import TrainConfig, train

router = APIRouter(prefix="/api", tags=["learning"])


class PredictionIn(BaseModel):
    # Geometry only. Neither the filename nor an example label is accepted.
    triangles: list[FiniteFloat] = Field(min_length=9, max_length=900000)

    @model_validator(mode="after")
    def complete_triangles(self):
        if len(self.triangles) % 9:
            raise ValueError("Each triangle needs nine coordinates.")
        return self


class TrainingIn(BaseModel):
    epochs: int = Field(default=160, ge=5, le=300)
    learning_rate: float = Field(default=.03, ge=.001, le=.2, allow_inf_nan=False)
    hidden_units: int = Field(default=48, ge=8, le=128)
    hidden_layers: int = Field(default=2, ge=1, le=3)
    activation: str = Field(default="relu", pattern="^(relu|tanh)$")
    seed: int = Field(default=42, ge=0, le=100000)


def load_artifact(folder):
    # Only trusted locally produced weights are loaded; never accept uploaded checkpoints.
    checkpoint = torch.load(folder / "model.pt", map_location="cpu", weights_only=True)
    if checkpoint["feature_version"] != FEATURE_VERSION:
        raise ValueError("Checkpoint preprocessing version does not match this application.")
    config = checkpoint["config"]
    model = MeshMLP(hidden_units=config["hidden_units"], hidden_layers=config["hidden_layers"], activation=config["activation"])
    model.load_state_dict(checkpoint["state_dict"])
    model.eval()
    report = json.loads((folder / "metrics.json").read_text())
    return model, checkpoint, report


class ModelService:
    def __init__(self):
        self.lock = RLock()
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mesh-training")
        self.jobs = {}
        self.cancel_flags = {}
        self.active_id = "reference"
        self.active = None

    def ensure_model(self):
        with self.lock:
            if self.active is None:
                try:
                    self.active = load_artifact(ROOT / "artifacts/reference")
                except FileNotFoundError as error:
                    raise HTTPException(503, "Trained weights are missing. Run python -m training.train first.") from error
            return self.active_id, self.active

    def start(self, config):
        with self.lock:
            if any(job["status"] in ["queued", "running", "cancelling"] for job in self.jobs.values()):
                raise HTTPException(409, "A training run is already in progress.")
            job_id = uuid4().hex[:12]
            self.jobs[job_id] = {"id": job_id, "status": "queued", "config": config.model_dump(), "history": [], "report": None}
            self.cancel_flags[job_id] = Event()
            # Bound in-memory job history; persisted run files remain on disk.
            if len(self.jobs) > 10:
                oldest = next(iter(self.jobs))
                del self.jobs[oldest]
                del self.cancel_flags[oldest]
            self.executor.submit(self.run, job_id, config)
            return deepcopy(self.jobs[job_id])

    def run(self, job_id, config):
        flag = self.cancel_flags[job_id]
        def progress(entry):
            with self.lock:
                self.jobs[job_id]["history"].append(entry)
        with self.lock:
            self.jobs[job_id]["status"] = "running"
        try:
            baseline = json.loads((ROOT / "artifacts/reference/metrics.json").read_text())["baseline"]
            report = train(TrainConfig(**config.model_dump()), ROOT / "artifacts/runs" / job_id,
                           progress=progress, cancelled=flag.is_set, baseline=baseline)
            with self.lock:
                self.jobs[job_id]["status"] = "cancelled" if flag.is_set() or report is None else "completed"
                self.jobs[job_id]["report"] = None if flag.is_set() else report
        except Exception as error:
            with self.lock:
                self.jobs[job_id].update(status="failed", error=str(error))

    def snapshot(self, job_id):
        with self.lock:
            if job_id not in self.jobs:
                raise HTTPException(404, "Training run not found (runs reset when the server restarts).")
            return deepcopy(self.jobs[job_id])

    def shutdown(self):
        with self.lock:
            for flag in self.cancel_flags.values():
                flag.set()
        self.executor.shutdown(wait=True, cancel_futures=True)


service = ModelService()


@router.get("/model")
def current_model():
    active_id, (_, _, report) = service.ensure_model()
    return {"id": active_id, "report": report}


@router.post("/predict")
def predict(payload: PredictionIn):
    try:
        features = extract_features(np.asarray(payload.triangles).reshape(-1, 3, 3))
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    active_id, (model, checkpoint, _) = service.ensure_model()
    x = (torch.from_numpy(features) - checkpoint["mean"]) / checkpoint["scale"]
    with torch.inference_mode():
        probabilities = model(x[None, :]).softmax(1)[0].tolist()
    winner = int(np.argmax(probabilities))
    warning = None
    if float(x.abs().max()) > 6:
        warning = "Geometry differs from the training distribution. Treat this prediction cautiously."
    elif probabilities[winner] < .6:
        warning = "The model is uncertain between these shape families."
    return {"class_name": checkpoint["classes"][winner], "class_index": winner,
            "probabilities": [{"label": name, "probability": value} for name, value in zip(checkpoint["classes"], probabilities)],
            "model_id": active_id, "warning": warning,
            "scope": "Four synthetic shape families only; probabilities are not calibrated confidence."}


@router.post("/training", status_code=202)
def start_training(config: TrainingIn):
    service.ensure_model()
    return service.start(config)


@router.get("/training/{job_id}")
def training_status(job_id: str):
    return service.snapshot(job_id)


@router.post("/training/{job_id}/cancel")
def cancel_training(job_id: str):
    with service.lock:
        job = service.snapshot(job_id)
        if job["status"] in ["queued", "running", "cancelling"]:
            service.cancel_flags[job_id].set()
            service.jobs[job_id]["status"] = "cancelling"
        return service.snapshot(job_id)


@router.post("/model/activate/{model_id}")
def activate_model(model_id: str):
    with service.lock:
        if model_id == "reference":
            folder = ROOT / "artifacts/reference"
        else:
            job = service.snapshot(model_id)
            if job["status"] != "completed":
                raise HTTPException(409, "Only completed training runs can be activated.")
            folder = ROOT / "artifacts/runs" / model_id
        service.active = load_artifact(folder)
        service.active_id = model_id
        return current_model()
