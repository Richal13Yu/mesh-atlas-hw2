"""Explicit SGD training, validation selection, and a held-out test evaluation."""
import argparse
from copy import deepcopy
from dataclasses import asdict, dataclass
import hashlib
import json
from pathlib import Path
import time

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, log_loss
import torch
from torch import nn

from training.dataset import CLASSES, ROOT, generate
from training.features import FEATURE_VERSION
from training.model import MeshMLP


@dataclass
class TrainConfig:
    epochs: int = 160
    learning_rate: float = .03
    hidden_units: int = 48
    hidden_layers: int = 2
    activation: str = "relu"
    batch_size: int = 64
    seed: int = 42


def load_data(path=ROOT / "data" / "features.npz"):
    with np.load(path, allow_pickle=False) as source:
        return {key: source[key].copy() for key in source.files}


def describe(y, probabilities):
    predictions = probabilities.argmax(axis=1)
    return {"loss": float(log_loss(y, probabilities, labels=range(4))),
            "accuracy": float(accuracy_score(y, predictions)),
            "macro_f1": float(f1_score(y, predictions, average="macro", zero_division=0)),
            "confusion_matrix": confusion_matrix(y, predictions, labels=range(4)).tolist(),
            "count": int(len(y))}


def fit_baseline(data, mean, scale):
    """Multinomial logistic regression, tuned on validation; same inputs/splits."""
    candidates, best, best_loss = [], None, float("inf")
    for c in [.01, .1, 1, 10, 100]:
        model = LogisticRegression(C=c, max_iter=3000, solver="lbfgs")
        model.fit((data["train_x"] - mean) / scale, data["train_y"])
        val = describe(data["validation_y"], model.predict_proba((data["validation_x"] - mean) / scale))
        candidates.append({"C": c, "validation_loss": val["loss"], "iterations": int(model.n_iter_.max())})
        if val["loss"] < best_loss:
            best, best_loss = model, val["loss"]
    metrics = {split: describe(data[f"{split}_y"], best.predict_proba((data[f"{split}_x"] - mean) / scale))
               for split in ["train", "validation", "test"]}
    return {"name": "Multinomial logistic regression (no hidden layer)", "selected_C": best.C,
            "validation_search": candidates, "metrics": metrics,
            "weights": best.coef_.tolist(), "bias": best.intercept_.tolist()}


def train(config, output, progress=None, cancelled=None, baseline=None, training_loss=None):
    started = time.perf_counter()
    torch.set_num_threads(1)
    torch.manual_seed(config.seed)
    data = load_data()
    # Fit preprocessing on TRAIN ONLY and reuse unchanged on val/test/inference.
    mean = data["train_x"].mean(axis=0)
    scale = np.maximum(data["train_x"].std(axis=0), 1e-6)
    x = {split: torch.from_numpy(((data[f"{split}_x"] - mean) / scale).astype(np.float32))
         for split in ["train", "validation", "test"]}
    y = {split: torch.from_numpy(data[f"{split}_y"]) for split in x}
    model = MeshMLP(hidden_units=config.hidden_units, hidden_layers=config.hidden_layers, activation=config.activation)
    optimizer = torch.optim.SGD(model.parameters(), lr=config.learning_rate, weight_decay=1e-4)
    criterion = nn.CrossEntropyLoss()
    history, best_loss, best_epoch, best_weights = [], float("inf"), 0, None
    initial = deepcopy(model.state_dict())
    generator = torch.Generator().manual_seed(config.seed + 1)

    def record(epoch, gradient_norm=None):
        model.eval()
        entry = {"epoch": epoch}
        with torch.no_grad():
            for split in ["train", "validation"]:
                logits = model(x[split])
                entry[f"{split}_loss"] = criterion(logits, y[split]).item()
                entry[f"{split}_accuracy"] = (logits.argmax(1) == y[split]).float().mean().item()
        if gradient_norm is not None:
            entry["gradient_norm"] = gradient_norm
        if not all(np.isfinite(value) for value in entry.values()):
            raise ValueError("Training diverged. Try a smaller learning rate.")
        history.append(entry)
        if progress:
            progress(entry)
        return entry

    record(0)
    for epoch in range(1, config.epochs + 1):
        if cancelled and cancelled():
            return None
        model.train()
        permutation = torch.randperm(len(x["train"]), generator=generator)
        gradient_norm = 0.
        for indices in permutation.split(config.batch_size):
            optimizer.zero_grad()                     # Clear previous batch gradients.
            logits = model(x["train"][indices])        # Forward propagation.
            loss = (training_loss or criterion)(logits, y["train"][indices])  # Cross-entropy loss.
            loss.backward()                           # Backpropagation via autograd.
            gradient_norm = float(torch.sqrt(sum((p.grad ** 2).sum() for p in model.parameters())))
            optimizer.step()                          # theta <- theta - lr * gradient.
        entry = record(epoch, gradient_norm)
        if entry["validation_loss"] < best_loss:
            best_loss, best_epoch, best_weights = entry["validation_loss"], epoch, deepcopy(model.state_dict())

    model.load_state_dict(best_weights)
    model.eval()
    with torch.no_grad():
        # Test is evaluated only AFTER epoch selection, never inside the epoch loop.
        metrics = {split: describe(data[f"{split}_y"], model(x[split]).softmax(1).numpy()) for split in x}
    weight_change = float(torch.sqrt(sum(((best_weights[k] - initial[k]) ** 2).sum() for k in initial)))
    if baseline is None:
        baseline = fit_baseline(data, mean, scale)
    report = {"config": asdict(config), "classes": CLASSES, "feature_version": FEATURE_VERSION,
              "architecture": [24] + [config.hidden_units] * config.hidden_layers + [4],
              "parameter_count": sum(p.numel() for p in model.parameters()),
              "history": history, "best_epoch": best_epoch, "metrics": metrics,
              "baseline": baseline, "weight_change_l2": weight_change,
              "data_sha256": hashlib.sha256((ROOT / "data/features.npz").read_bytes()).hexdigest(),
              "seconds": round(time.perf_counter() - started, 3),
              "test_policy": "Test used after validation checkpoint selection, never for gradients or epoch selection.",
              "scope": "Synthetic ellipsoids, cuboids, cylinders and tori; not validated on research scans."}
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    torch.save({"state_dict": best_weights, "mean": torch.from_numpy(mean), "scale": torch.from_numpy(scale),
                "config": asdict(config), "classes": CLASSES, "feature_version": FEATURE_VERSION}, output / "model.pt")
    (output / "metrics.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


def plot_report(report, output):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    history = report["history"]
    fig, axes = plt.subplots(1, 3, figsize=(14, 4), layout="constrained")
    for split, color in [("train", "#267b8f"), ("validation", "#d78246")]:
        axes[0].plot([r["epoch"] for r in history], [r[f"{split}_loss"] for r in history], label=split, color=color)
        axes[1].plot([r["epoch"] for r in history], [r[f"{split}_accuracy"] for r in history], label=split, color=color)
    axes[0].set(title="Cross-entropy loss", xlabel="Epoch", ylabel="Loss")
    axes[1].set(title="Classification accuracy", xlabel="Epoch", ylabel="Accuracy", ylim=(0, 1.03))
    for ax in axes[:2]:
        ax.axvline(report["best_epoch"], color="#999999", ls=":", label="Selected epoch")
        ax.legend(fontsize=8)
        ax.grid(alpha=.2)
    cm = np.array(report["metrics"]["test"]["confusion_matrix"])
    axes[2].imshow(cm, cmap="Blues")
    for i in range(4):
        for j in range(4):
            axes[2].text(j, i, str(cm[i, j]), ha="center", va="center", color="white" if cm[i, j] > cm.max() / 2 else "black")
    axes[2].set(xticks=range(4), yticks=range(4), xticklabels=CLASSES, yticklabels=CLASSES,
                xlabel="Predicted", ylabel="Actual", title="Held-out test confusion matrix")
    axes[2].tick_params(axis="x", rotation=25)
    fig.savefig(Path(output) / "training-results.png", dpi=180)
    plt.close(fig)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=160)
    parser.add_argument("--learning-rate", type=float, default=.03)
    parser.add_argument("--hidden-units", type=int, default=48)
    parser.add_argument("--hidden-layers", type=int, default=2)
    parser.add_argument("--activation", choices=["relu", "tanh"], default="relu")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts" / "reference")
    args = parser.parse_args()
    if not (ROOT / "data/features.npz").exists():
        generate()
    config = TrainConfig(epochs=args.epochs, learning_rate=args.learning_rate, hidden_units=args.hidden_units,
                         hidden_layers=args.hidden_layers, activation=args.activation, seed=args.seed)
    result = train(config, args.output, progress=lambda row: print(json.dumps(row), flush=True) if row["epoch"] % 20 == 0 else None)
    plot_report(result, args.output)
    print(json.dumps({"MLP": result["metrics"], "baseline": result["baseline"]["metrics"], "best_epoch": result["best_epoch"]}, indent=2))
