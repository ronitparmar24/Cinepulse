# CinePulse Model Audit & Training Report (v6)

## Executive Summary
This document provides the mathematical verification and empirical performance benchmarks for **CinePulse Model v6** (`cinepulse-v6-ridge-platt`). It replaces the legacy hand-tuned heuristics with a model trained on verified historical box office data using a strict temporal split.

---

## 1. Strict Temporal Date Split
To eliminate lookahead bias and franchise data leakage, records were partitioned chronologically:
- **Training Set (≤ 2021-12-31)**: 30 titles. Used for feature estimation and coefficient learning.
- **Validation Set (2022-01-01 to 2023-12-31)**: 19 titles. Used for Platt calibration, hyperparameter validation, and residual quantile extraction.
- **Out-of-Time Test Set (≥ 2024-01-01)**: 10 titles. Kept completely untouched during training for realistic out-of-sample benchmarking.

---

## 2. Regression Performance (Worldwide Box Office $\log_{10}$)
- **Algorithm**: Ridge Regression ($L_2$ regularization $\alpha = 2.5$)
- **Train MAE (log-space)**: `0.1068`
- **Validation MAE (log-space)**: `0.1483`
- **Out-of-Time Test MAE (log-space)**: `0.1631`
- **Empirical Residual Quantiles**:
  - $P_{10}$ Lower Bound (bear residual): `-0.2248`
  - $P_{50}$ Median: `+0.0900`
  - $P_{90}$ Upper Bound (bull breakout residual): `+0.2623`

---

## 3. Hit / Flop Classification & Platt Calibration
A title is defined as a **Hit** if $\text{Worldwide Revenue} \ge 2.5 \times \text{Production Budget}$.

- **Base Classifier**: Logistic Regression with standard feature normalization.
- **Platt Scaling**: Calibrated on the 2022–2023 validation split:
  $$P(\text{Hit} \mid s) = \frac{1}{1 + \exp(-(0.3123 \cdot s +1.4010))}$$
- **Brier Scores** ($Brier = \frac{1}{N}\sum (p_i - y_i)^2$):
  - **Train Brier**: `0.0793`
  - **Validation Brier**: `0.0947`
  - **Out-of-Time Test Brier**: `0.0080`

### Reliability Calibration Diagram (Validation Split)
| Confidence Bin | Sample Size | Avg Predicted Probability | Empirical Actual Hit Rate |
|:---|:---|:---|:---|
| 0%-25% | 0 | 12.5% | 0.0% |
| 25%-50% | 0 | 37.5% | 0.0% |
| 50%-75% | 0 | 62.5% | 0.0% |
| 75%-100% | 19 | 88.8% | 89.5% |

---

## 4. Top Predictive Feature Coefficients
| Feature | Regression Weight ($w_{rev}$) | Classification Weight ($w_{hit}$) |
|:---|:---|:---|
| `genre_science_fiction` | -0.0911 | -0.3710 |
| `genre_adventure` | +0.0910 | -0.1819 |
| `is_holiday_window` | +0.0779 | -0.0843 |
| `studio_tier` | +0.0747 | +0.8151 |
| `genre_fantasy` | -0.0656 | +0.0390 |
| `genre_family` | +0.0560 | +0.0681 |
| `genre_action` | -0.0493 | +0.1613 |
| `competing_release_count` | +0.0442 | +0.8488 |
| `genre_crime` | +0.0394 | +0.0832 |
| `genre_music` | +0.0278 | +0.0323 |

---

## 5. Out-of-Time Test Set Verification (2024+ Sample Titles)
| Title | Release Date | Budget | Actual Revenue | Predicted Box Office | Calibrated Hit % | Actual Outcome |
|:---|:---|:---|:---|:---|:---|:---|
| Inside Out 2 | 2024-06-11 | $200,000,000.0 | $1,698,863,816.0 | $830,785,086 | 92% | **HIT** |
| Deadpool & Wolverine | 2024-07-24 | $200,000,000.0 | $1,338,073,645.0 | $1,097,256,202 | 92% | **HIT** |
| Moana 2 | 2024-11-21 | $150,000,000.0 | $1,059,242,164.0 | $1,182,838,021 | 92% | **HIT** |
| Despicable Me 4 | 2024-06-20 | $100,000,000.0 | $972,021,410.0 | $913,521,809 | 92% | **HIT** |
| Wicked | 2024-10-16 | $150,000,000.0 | $763,963,597.0 | $1,097,032,243 | 92% | **HIT** |
| Mufasa: The Lion King | 2024-12-18 | $200,000,000.0 | $722,631,756.0 | $1,111,394,522 | 89% | **HIT** |
| Dune: Part Two | 2024-02-27 | $190,000,000.0 | $714,844,358.0 | $1,179,320,344 | 91% | **HIT** |
| Godzilla x Kong: The New Empire | 2024-03-27 | $150,000,000.0 | $571,750,016.0 | $729,551,833 | 88% | **HIT** |

---
*Generated automatically by `scripts/train_model.py` on CinePulse v6 foundations run.*
