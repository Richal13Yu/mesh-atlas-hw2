"""Run from the repository root with python -m hw3.experiment."""
import json
from pathlib import Path
import torch.nn.functional as F
from training.train import train, TrainConfig

OUTPUT = Path(__file__).parent / "results"


def pair_objective(logits, labels, conditional):
    ordinary = F.cross_entropy(logits, labels)
    pair = (labels == 1) | (labels == 2)
    if not pair.any():
        return ordinary
    scores = logits[pair]
    targets = labels[pair]
    if conditional:
        scores = scores[:, 1:3]
        targets = targets - 1
    extra = F.cross_entropy(scores, targets, reduction="sum") / len(labels)
    return ordinary + extra


if __name__ == "__main__":
    rows = []
    for seed in (42, 43, 44):
        for mode in ("baseline", "pair", "reweight"):
            objective = None if mode == "baseline" else lambda z, y: pair_objective(z, y, mode == "pair")
            report = train(TrainConfig(seed=seed), OUTPUT / str(seed) / mode,
                           baseline={"status": "not run"}, training_loss=objective)
            test = report["metrics"]["test"]
            cm = test["confusion_matrix"]
            row = dict(seed=seed, mode=mode, pair_errors=cm[1][2]+cm[2][1],
                       errors=round((1-test["accuracy"])*test["count"]),
                       loss=test["loss"], f1=test["macro_f1"], epoch=report["best_epoch"])
            print(row, flush=True)
            rows.append(row)
    (OUTPUT / "summary.json").write_text(json.dumps(rows, indent=2))
