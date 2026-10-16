# HW2 live demonstration (under three minutes)

The prepared recording uses the actual running browser application, English captions and a computer-generated English narration. It demonstrates measured predictions/training, not animated mock results. `scripts/demo_scenes.json` contains the narration and caption text. The student should review the recording and code before submitting; narration is not a claim that the student personally spoke or independently mastered the material.

| Approximate time | Show | Explain |
|---|---|---|
| 0:00–0:16 | Rotate the default torus and toggle wireframe | HW1 viewer extended with four-class mesh learning; original viewer features retained. |
| 0:16–0:31 | Predict the torus | Triangle geometry reaches FastAPI/PyTorch; class probabilities return to the UI. |
| 0:31–0:45 | Select and predict an ellipsoid and a cylinder | Different, independently generated objects produce new predictions. |
| 0:45–1:00 | Upload the binary cuboid STL and predict | A provided file follows the same pipeline without a notebook or inference script. |
| 1:00–1:20 | Open Training lab; show architecture and settings | 24 → 48 → 48 → 4 MLP, ReLU, 3,748 parameters, cross-entropy and mini-batch SGD; small enough to explain and run locally. |
| 1:20–1:42 | Show loss/accuracy curves, test metrics and confusion matrix | Test accuracy 99.17%, versus shallow logistic regression 98.50%; 5 versus 9 errors, mainly confusion around cylinders/cuboids. |
| 1:42–2:04 | Change learning rate, epochs, width and layer count; start training | **Optional challenge 1:** interactive hyperparameters. **Optional challenge 2:** live train/validation curves and completed train/val/test metrics. |
| 2:04–2:22 | Activate the newly trained model and predict again | GUI training creates actual weights used by the same inference service. |
| 2:22–2:45 | Restore reference model and show its results | Synthetic-domain limitations, uncalibrated scores, reproducible artifacts and AI disclosure. |

Exact timestamps are recorded in the generated subtitle file; actual timing depends on narration and local execution speed. The prepared final MP4 is **156.06 seconds (2:36)**, below the 180-second limit.

## If recording your own narration

Start `npm start`, open `http://localhost:5173`, and follow the sequence above. Use the reference model when stating the reference scores. A new run can score differently; describe the numbers actually shown. Do not claim these synthetic results validate a research or medical application.

## Re-record the browser walkthrough

With both servers running, run `node scripts/record_demo.mjs`. On macOS it uses Google Chrome; set `CHROME_PATH` to override. Without optional prepared audio timing, it records captions with estimated reading time. Temporary recordings go to `artifacts/demo-raw/` and are excluded from Git. The recorder waits for actual API and training results before advancing.

For the included macOS narration and final MP4 (requires `say` and `ffmpeg`):

```bash
.venv/bin/python scripts/prepare_demo_audio.py
node scripts/record_demo.mjs
.venv/bin/python scripts/finalize_demo.py
```

The default final output is the sibling `submission/` folder. `finalize_demo.py` rejects a raw recording of 180 seconds or longer; it preserves the real recording speed and aligns audio using the recorded scene times.
