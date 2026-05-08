# Semantic Similarity Scorer

ML-powered scoring service that compares user spoken answers with flashcard expected answers using semantic similarity instead of simple word overlap.

## Architecture

```
User speaks answer → Transcribe → Scorer API → Trained Model → Score + Suggestion
```

## 📚 Documentation

- **[IMPLEMENTATION_PLAN.md](./docs/IMPLEMENTATION_PLAN.md)** - Step-by-step implementation guide with full code examples
- **[PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md)** - Directory structure and organization explained

## Components

- `train.py` — Training pipeline with MLflow tracking
- `app.py` — FastAPI serving endpoint
- `evaluate.py` — Model evaluation vs baseline
- `generate_data.py` — Synthetic training data generator
- `models/` — Saved models (local registry)
- `data/` — Training/test datasets
- `mlruns/` — MLflow experiment tracking data

## Quick Start

### 1. Train Model

```bash
cd mlops/scorer
python train.py
```

This will:
- Load or generate training data
- Train a sentence-transformer model for semantic similarity
- Log experiments to MLflow
- Save the best model to `models/`

### 2. Serve Model

```bash
uvicorn app:app --reload --port 8002
```

### 3. Test Scoring

```bash
curl -X POST http://localhost:8002/score \
  -H "Content-Type: application/json" \
  -d '{
    "user_answer": "It is a way to organize code",
    "expected_answer": "A method for structuring and organizing your codebase"
  }'
```

Response:
```json
{
  "score": 85,
  "similarity": 0.8521,
  "suggestion": "easy",
  "method": "sentence-transformer"
}
```

## Model Details

- **Base Model**: `all-MiniLM-L6-v2` (Sentence Transformers)
- **Size**: ~90MB
- **Inference Time**: ~10-20ms per comparison
- **Method**: Cosine similarity between sentence embeddings

## Integration with Main App

Replace frontend's `textSimilarity.js` with API call to this scorer service:

```javascript
// Before: word overlap
const result = compareSimilarity(spoken, expected);

// After: semantic similarity via ML model
const result = await fetch('/api/score', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    user_answer: spoken, 
    expected_answer: expected 
  })
}).then(r => r.json());
```

## MLflow Tracking

View experiments:
```bash
mlflow ui --port 5000
```

Navigate to http://localhost:5000 to see:
- Training metrics (accuracy, F1, etc.)
- Model parameters
- Comparison between runs
