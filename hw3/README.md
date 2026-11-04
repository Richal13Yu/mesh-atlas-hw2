# HW3 · Extra practice on the cuboid–cylinder boundary

Can a second, two-way decision reduce a four-way mesh classifier's most frequent error? On the original HW2 test split, four of five mistakes confused cuboids and cylinders.

## Experiment

Mesh Atlas uses 24 standardized surface descriptors per synthetic object. The four balanced shape families are ellipsoid, cuboid, cylinder and torus. The original independent object splits contain 1,600 training, 400 validation and 600 test meshes. The scaler is fitted on training data. The classifier is a 24 → 48 ReLU → 48 ReLU → 4 MLP (3,748 parameters).

- **Baseline** uses the original four-class cross-entropy.
- **Pair** adds two-class cross-entropy on the existing cuboid and cylinder logits for examples belonging to those classes. The extra losses are summed and divided by the entire batch size. This directly rewards a larger logit advantage over the rival shape.
- **Reweight** uses the same examples and normalization for the extra term but retains all four logits. This controls for giving the pair extra training weight.

All models use 160 epochs, SGD at 0.03, batch size 64 and weight decay 0.0001. Seeds 42, 43 and 44 control initialization and minibatch order, matched within each comparison. Checkpoints minimize four-way validation cross-entropy. Epoch histories report ordinary four-way loss for comparison across objectives.

## Reproduce

From the repository root on Python 3.12 (tested on macOS CPU):

```sh
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements-lock.txt
python -m hw3.experiment
```

The synthetic feature archive is included under `data/`. The script writes per-seed checkpoints and metrics (including epoch histories and confusion matrices) to `hw3/results/<seed>/<mode>/` and the comparison to `hw3/results/summary.json`. Rerunning overwrites these outputs.

## Observations

Each cell gives cuboid ↔ cylinder errors / all test errors. There are 300 target-pair examples and 600 total examples per run.

| Objective | Seed 42 | Seed 43 | Seed 44 | Mean accuracy |
|---|---:|---:|---:|---:|
| Baseline | 4 / 5 | 3 / 3 | 4 / 4 | 99.33% |
| Pair | 2 / 3 | 2 / 2 | 3 / 3 | 99.56% |
| Reweight | 3 / 4 | 2 / 2 | 3 / 3 | 99.50% |

Seed 42 reproduces HW2. The two-way objective reduces pair errors at every seed, but simple reweighting ties it twice. The specific advantage of isolating two logits is one object on one seed. All runs use the same objects and the historical test set suggested the target pair. A fresh set of shapes would better test generalization. See the [experiment summary](experiment-summary.pdf) for loss curves and directional errors.

AI assistance was used to brainstorm alternatives, implement the selected hypothesis, run comparisons and prepare the report and narrated demo.
