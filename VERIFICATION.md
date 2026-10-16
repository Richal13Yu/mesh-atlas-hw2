# Verification record

Verified locally on October 14, 2026, using CPU PyTorch, Python 3.12, Node.js and Chrome on macOS.

| Check | Result |
|---|---|
| `python -m unittest discover -s backend -v` | 7 tests passed |
| `npm run test:e2e` with actual frontend/backend | Passed |
| `npm run build` | Passed; expected Three.js bundle-size advisory |
| `npm audit` | 0 known vulnerabilities reported at check time |
| Reference dataset isolation | 2,600 unique generation seeds and geometry hashes across all splits |
| Reference checkpoint | Train-only scaler, nonzero weight changes, decreasing measured loss |
| Browser predictions | All four independent example OBJ files classified correctly |
| Uploaded binary STL | Cuboid classified correctly even with a misleading filename |
| Training/monitor | Real training, completed evaluation, activation and reference restoration |
| Cancellation/concurrency | Cancelled run preserves active model; simultaneous run rejected |
| Annotation regression | Surface selection, SQLite persistence, reload and deletion passed |
| Invalid input/service failure | Visible errors; no fabricated fallback predictions |
| Responsive layout | Desktop inspected; 390-pixel mobile layout has no horizontal overflow |
| Submission video | Live browser capture, visual inspection, final duration below 180 seconds |

Docker was not executed. This verification covers local course-demo behavior and synthetic benchmark performance, not production deployment, arbitrary research scans or calibrated uncertainty.

## English submission update — October 16, 2026

The model guide and submission notes were converted to English. Local document links and English-only source text were checked, and the source archive was rebuilt. The existing English video was preserved; its current measured duration is 156.06 seconds. Subtitle timings were aligned with its 2.4195-second leading trim, confirmed against the original narration audio. Application code and trained weights are unchanged by this documentation update.
