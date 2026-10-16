# HW2 Model Guide and Discussion Preparation

## What this project does

Mesh Atlas extends the HW1 3D viewer with learning and prediction. After a mesh is selected or uploaded, the browser sends triangle coordinates to the local FastAPI service. The backend samples the surface, extracts features, standardizes them, and runs a PyTorch MLP. The frontend displays probabilities for four classes: ellipsoid, cuboid, cylinder, and torus. All training data are synthetic.

## Why an MLP?

The input is a fixed vector of 24 geometric features, so the network does not need to flatten raw vertices or accommodate different vertex counts. Hidden layers with ReLU activations can learn nonlinear relationships between the features. The network has only 3,748 trainable parameters and can be trained on a CPU. This implementation uses neither PointNet nor a convolutional or pretrained model.

The architecture is `24 → 48 → 48 → 4`:

- First layer: `24 × 48 + 48 = 1,200` parameters.
- Second layer: `48 × 48 + 48 = 2,352` parameters.
- Output layer: `48 × 4 + 4 = 196` parameters.
- Total: **3,748**, including biases.

## Where the features come from

1. Select triangles in proportion to their area and sample points inside them using barycentric coordinates, producing 1,024 surface points. This prevents densely tessellated regions from receiving extra weight simply because they contain more vertices.
2. Subtract the sampled centroid and divide by the RMS radius to remove global translation and uniform scale.
3. Extract three covariance eigenvalue fractions, nine radial-distance quantiles, three standardized fourth moments along principal axes, and nine pairwise-distance quantiles: 24 features in total.
4. Standardize every split and inference input using the feature means and standard deviations fitted on the training set only.

For a fixed set of sampled points, these descriptors are insensitive to global rotation, translation, and uniform scale. Remeshing changes finite surface samples, and nearly equal eigenvalues can make principal axes unstable. The descriptors are not invariant to every possible mesh change and do not preserve all topology.

## Forward propagation

For one standardized feature vector `x`, the network computes:

```text
h1 = ReLU(W1 x + b1)
h2 = ReLU(W2 h1 + b2)
z  = W3 h2 + b3
```

The four values in `z` are logits, not probabilities. At inference, `softmax(z)` produces the displayed probabilities; the largest determines the predicted class.

## Loss, backpropagation, and updates

For one labeled example, cross-entropy is `L = -log(p_true)`. PyTorch's `CrossEntropyLoss` takes logits directly and applies a numerically stable log-softmax internally. Applying softmax before this loss changes its intended input.

`loss.backward()` applies the chain rule to calculate the loss gradient with respect to each parameter. `optimizer.step()` updates those parameters. The default optimizer is mini-batch SGD without momentum, with small L2 weight decay:

```text
theta <- theta - learning_rate * (gradient + 0.0001 * theta)
```

Call `zero_grad()` at the beginning of each batch because PyTorch accumulates gradients by default. Without clearing them, gradients from earlier batches would be added to the current update.

The reference run uses learning rate 0.03, 160 epochs, batch size 64, and seed 42. With 1,600 training objects, each epoch contains 25 updates. Epoch zero records the untrained network. The curves show actual measurements rather than a prerecorded animation.

## Why separate training, validation, and test data?

- **Training: 1,600 objects.** Used for gradients and normalization statistics.
- **Validation: 400 objects.** Used to select the training checkpoint and baseline regularization.
- **Test: 600 objects.** Evaluated after model selection.

Each split is balanced across classes. Generation seeds do not overlap, and geometry hashes are recorded. Different views of the same object should not be distributed across splits and then described as entirely unseen test objects.

Repeated GUI experiments reuse the fixed test set for teaching. In research, repeatedly selecting hyperparameters based on those test results would compromise its role as a final holdout. A new final test set would be needed.

## Interpreting the results

The reference MLP achieves 100% training accuracy, 99.5% validation accuracy, and 99.1667% test accuracy (595/600). Test cross-entropy is approximately 0.02338. Logistic regression achieves 98.5% test accuracy (591/600), with cross-entropy approximately 0.04100. The MLP makes four fewer errors in this fixed experiment; this small difference is not proof of a statistically reliable advantage.

The MLP's five test mistakes are one cuboid predicted as a cylinder, three cylinders predicted as cuboids, and one cylinder predicted as a torus. Overlapping global shape descriptors are a plausible explanation. Individual error meshes have not been inspected to establish the specific cause of each mistake.

Logistic regression is a four-class linear model with no hidden layer. It receives the same features and standardization. Its regularization parameter is selected from five values using validation loss, so the comparison does not intentionally deprive the baseline of optimization or tuning.

## Questions to be ready to answer

**Does 100% training accuracy prove overfitting?** No. Consider validation loss, validation accuracy, task difficulty, and test performance together. This synthetic task is relatively easy, and the gap between 100% training accuracy and 99.5% validation accuracy is small. Generalization to real data is still unknown.

**Could the classifier be using filenames?** The prediction request contains triangle coordinates only. A browser test renames a cuboid STL to `not-a-torus.stl`; the expected prediction remains cuboid. Example-button labels are not sent to the classification API.

**Does a 99% probability mean 99% reliability?** No. These are uncalibrated softmax scores. An unknown category can receive a high score, and the model must choose one of its four known classes.

**Are user annotations used for training?** No. HW1 annotations remain in SQLite, while the supervised labels for this assignment come from the geometry generator. Annotation functionality does not imply that the model learns from user annotations.

**How can you demonstrate that learning actually occurs?** Show the loss decreasing from epoch zero, the `loss.backward()` and `optimizer.step()` calls, nonzero gradient norms, and an L2 parameter change of approximately 6.1777 from initialization to the selected checkpoint.

**When does a newly trained model serve predictions?** After a GUI run completes, click **Use trained model for predictions**. The reference model can be restored at any time and becomes active again after a server restart. Run checkpoints and metrics are stored under `artifacts/runs/`.

**What do the backend and database do?** FastAPI serves HTTP endpoints and runs inference. Training runs in a background thread while the frontend polls progress. SQLite stores mesh metadata and surface annotations. Weights and training metrics are stored as files, not in SQLite.

## Independent review

The assignment permits AI assistance but requires independent understanding. Read `training/model.py`, `training/features.py`, and `training/train.py`; calculate the parameter count yourself; and study the backpropagation paper and PyTorch tutorial linked in the README. This guide is preparation material, not evidence that the student has already read or mastered those sources.
