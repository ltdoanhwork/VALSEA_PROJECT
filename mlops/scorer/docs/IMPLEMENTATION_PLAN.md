# MLOps Scorer - Implementation Plan

## Overview

Bạn sẽ xây dựng một **Semantic Similarity Scorer Service** để thay thế word-overlap scoring hiện tại bằng ML model. Pipeline hoàn chỉnh từ training → tracking → serving → monitoring.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Training Phase                          │
├─────────────────────────────────────────────────────────────┤
│ generate_data.py → train.py → MLflow → models/best_model/  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                     Serving Phase                           │
├─────────────────────────────────────────────────────────────┤
│  FastAPI (app.py) → Load Model → /score endpoint            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                Integration with Main App                    │
├─────────────────────────────────────────────────────────────┤
│  Frontend → POST /api/score → Scorer Service → Response    │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 1: Generate Training Data

**File**: `mlops/scorer/generate_data.py`

**Mục đích**: Tạo synthetic training data với các cặp (answer1, answer2, similarity_label)

**Code**:

```python
"""Generate training data for semantic similarity scoring."""
import json
import random
from pathlib import Path

# Example flashcard answers (you can extract from your real data later)
SAMPLE_ANSWERS = [
    "A function is a reusable block of code that performs a specific task",
    "Functions are pieces of code you can call multiple times",
    "It's a way to organize and reuse code logic",
    "A variable stores a value in memory",
    "Variables hold data that can change during program execution",
    "A loop repeats a block of code multiple times",
    "Loops let you iterate over items or repeat actions",
    "An array is a collection of elements stored in contiguous memory",
    "Arrays are data structures that hold multiple values of the same type",
]

def generate_similar_pairs():
    """Generate similar answer pairs (score > 0.7)"""
    pairs = []
    # Same answer with slight variation
    for answer in SAMPLE_ANSWERS:
        # Exact match
        pairs.append({
            "answer1": answer,
            "answer2": answer,
            "label": 1.0  # Perfect similarity
        })
        
        # Paraphrase (add variations manually or use LLM)
        paraphrases = {
            "A function is a reusable block of code that performs a specific task": 
                "Functions are reusable code blocks for specific tasks",
            "Variables hold data that can change during program execution":
                "A variable stores changing data while the program runs",
            # Add more paraphrases...
        }
        if answer in paraphrases:
            pairs.append({
                "answer1": answer,
                "answer2": paraphrases[answer],
                "label": 0.85  # High similarity
            })
    
    return pairs

def generate_dissimilar_pairs():
    """Generate dissimilar answer pairs (score < 0.3)"""
    pairs = []
    for i, answer1 in enumerate(SAMPLE_ANSWERS):
        for answer2 in SAMPLE_ANSWERS[i+2:]:  # Skip adjacent ones
            pairs.append({
                "answer1": answer1,
                "answer2": answer2,
                "label": 0.1  # Low similarity
            })
    return pairs[:20]  # Limit to 20 pairs

def generate_medium_pairs():
    """Generate medium similarity pairs (0.3-0.7)"""
    pairs = []
    # Related but not identical concepts
    medium_pairs = [
        ("A function is a reusable block of code", 
         "A method is similar but belongs to a class", 0.5),
        ("Variables hold data that can change",
         "Constants store values that don't change", 0.4),
    ]
    for a1, a2, label in medium_pairs:
        pairs.append({"answer1": a1, "answer2": a2, "label": label})
    return pairs

def main():
    data = []
    data.extend(generate_similar_pairs())
    data.extend(generate_dissimilar_pairs())
    data.extend(generate_medium_pairs())
    
    # Shuffle
    random.shuffle(data)
    
    # Split train/test (80/20)
    split_idx = int(0.8 * len(data))
    train_data = data[:split_idx]
    test_data = data[split_idx:]
    
    # Save
    Path("data").mkdir(exist_ok=True)
    with open("data/train.json", "w") as f:
        json.dump(train_data, f, indent=2)
    with open("data/test.json", "w") as f:
        json.dump(test_data, f, indent=2)
    
    print(f"✅ Generated {len(train_data)} train + {len(test_data)} test examples")
    print("📁 Saved to data/train.json and data/test.json")

if __name__ == "__main__":
    main()
```

**Chạy**:
```bash
cd mlops/scorer
python generate_data.py
```

**Sau này**: Thay SAMPLE_ANSWERS bằng real flashcard data từ database của bạn.

---

## Step 2: Train Model với MLflow Tracking

**File**: `mlops/scorer/train.py`

**Mục đích**: Train sentence-transformer model và track experiments với MLflow

**Code**:

```python
"""Train semantic similarity scorer with MLflow tracking."""
import json
import mlflow
import mlflow.pytorch
import numpy as np
from pathlib import Path
from sentence_transformers import SentenceTransformer, InputExample, losses
from sentence_transformers.evaluation import EmbeddingSimilarityEvaluator
from torch.utils.data import DataLoader

# Config
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"  # Fast, small (80MB)
BATCH_SIZE = 16
EPOCHS = 4
OUTPUT_DIR = "models/scorer_v1"

def load_data(path: str):
    """Load training/test data"""
    with open(path) as f:
        data = json.load(f)
    
    examples = []
    for item in data:
        examples.append(InputExample(
            texts=[item["answer1"], item["answer2"]],
            label=float(item["label"])
        ))
    return examples

def main():
    print("🚀 Starting training pipeline...")
    
    # Set MLflow experiment
    mlflow.set_experiment("semantic-similarity-scorer")
    
    with mlflow.start_run():
        # Log parameters
        mlflow.log_param("model_name", MODEL_NAME)
        mlflow.log_param("batch_size", BATCH_SIZE)
        mlflow.log_param("epochs", EPOCHS)
        
        # Load data
        print("📚 Loading training data...")
        train_examples = load_data("data/train.json")
        test_examples = load_data("data/test.json")
        
        mlflow.log_param("train_size", len(train_examples))
        mlflow.log_param("test_size", len(test_examples))
        
        # Initialize model
        print(f"🤖 Loading base model: {MODEL_NAME}")
        model = SentenceTransformer(MODEL_NAME)
        
        # Create DataLoader
        train_dataloader = DataLoader(
            train_examples, 
            shuffle=True, 
            batch_size=BATCH_SIZE
        )
        
        # Loss function (CosineSimilarityLoss for regression)
        train_loss = losses.CosineSimilarityLoss(model)
        
        # Evaluator
        evaluator = EmbeddingSimilarityEvaluator.from_input_examples(
            test_examples, 
            name='test-eval'
        )
        
        # Train
        print(f"🏋️ Training for {EPOCHS} epochs...")
        model.fit(
            train_objectives=[(train_dataloader, train_loss)],
            epochs=EPOCHS,
            evaluator=evaluator,
            evaluation_steps=100,
            warmup_steps=100,
            output_path=OUTPUT_DIR
        )
        
        # Evaluate on test set
        print("📊 Evaluating on test set...")
        test_score = evaluator(model)
        
        mlflow.log_metric("test_correlation", test_score)
        
        # Save model to MLflow
        print("💾 Saving model to MLflow...")
        mlflow.pytorch.log_model(model, "model")
        
        # Also save locally
        model.save(OUTPUT_DIR)
        
        print(f"✅ Training complete!")
        print(f"   Test correlation: {test_score:.4f}")
        print(f"   Model saved to: {OUTPUT_DIR}")
        print(f"   MLflow run ID: {mlflow.active_run().info.run_id}")

if __name__ == "__main__":
    main()
```

**Chạy**:
```bash
cd mlops/scorer
python train.py
```

**View MLflow UI**:
```bash
mlflow ui --port 5000
# Open http://localhost:5000
```

---

## Step 3: Create FastAPI Serving Endpoint

**File**: `mlops/scorer/app.py`

**Mục đích**: Serve trained model qua REST API

**Code**:

```python
"""FastAPI service for semantic similarity scoring."""
from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer, util
import torch
from pathlib import Path

app = FastAPI(title="Semantic Similarity Scorer", version="1.0.0")

# Load model on startup
MODEL_PATH = "models/scorer_v1"
print(f"Loading model from {MODEL_PATH}...")
model = SentenceTransformer(MODEL_PATH)
print("✅ Model loaded successfully")

class ScoreRequest(BaseModel):
    user_answer: str
    expected_answer: str

class ScoreResponse(BaseModel):
    score: int  # 0-100
    similarity: float  # 0.0-1.0 (raw cosine similarity)
    suggestion: str  # "easy", "good", "hard", "again"
    method: str = "sentence-transformer"

@app.get("/health")
def health():
    return {"status": "healthy", "model": MODEL_PATH}

@app.post("/score", response_model=ScoreResponse)
def score_similarity(req: ScoreRequest):
    """
    Score semantic similarity between user answer and expected answer.
    
    Returns:
    - score: 0-100 integer score
    - similarity: raw cosine similarity (0.0-1.0)
    - suggestion: spaced repetition suggestion ("easy", "good", "hard", "again")
    """
    # Generate embeddings
    emb1 = model.encode(req.user_answer, convert_to_tensor=True)
    emb2 = model.encode(req.expected_answer, convert_to_tensor=True)
    
    # Compute cosine similarity
    similarity = util.cos_sim(emb1, emb2).item()
    
    # Convert to 0-100 score
    score = int(max(0, min(100, similarity * 100)))
    
    # Map to spaced repetition suggestion
    if score >= 80:
        suggestion = "easy"
    elif score >= 60:
        suggestion = "good"
    elif score >= 40:
        suggestion = "hard"
    else:
        suggestion = "again"
    
    return ScoreResponse(
        score=score,
        similarity=similarity,
        suggestion=suggestion
    )

@app.get("/")
def root():
    return {
        "service": "Semantic Similarity Scorer",
        "version": "1.0.0",
        "endpoints": {
            "POST /score": "Score similarity between two texts",
            "GET /health": "Health check"
        }
    }
```

**Chạy**:
```bash
cd mlops/scorer
uvicorn app:app --reload --port 8002
```

**Test**:
```bash
curl -X POST http://localhost:8002/score \
  -H "Content-Type: application/json" \
  -d '{
    "user_answer": "A function is code you can reuse",
    "expected_answer": "A function is a reusable block of code"
  }'
```

Expected response:
```json
{
  "score": 87,
  "similarity": 0.8712,
  "suggestion": "easy",
  "method": "sentence-transformer"
}
```

---

## Step 4: Model Evaluation & Comparison

**File**: `mlops/scorer/evaluate.py`

**Mục đích**: So sánh ML model với baseline word-overlap method

**Code**:

```python
"""Evaluate ML model vs baseline word-overlap."""
import json
from sentence_transformers import SentenceTransformer, util
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error
import matplotlib.pyplot as plt

# Load model
model = SentenceTransformer("models/scorer_v1")

def word_overlap_score(text1: str, text2: str) -> float:
    """Baseline: word overlap F1 score (from textSimilarity.js)"""
    def normalize(text):
        return text.lower().replace(",", "").replace(".", "").split()
    
    words1 = set(normalize(text1))
    words2 = set(normalize(text2))
    
    if not words2:
        return 0.0
    
    matched = len(words1 & words2)
    precision = matched / len(words1) if words1 else 0
    recall = matched / len(words2)
    
    if precision + recall == 0:
        return 0.0
    
    f1 = 2 * precision * recall / (precision + recall)
    return f1

def semantic_score(text1: str, text2: str) -> float:
    """ML model: semantic similarity"""
    emb1 = model.encode(text1, convert_to_tensor=True)
    emb2 = model.encode(text2, convert_to_tensor=True)
    return util.cos_sim(emb1, emb2).item()

def evaluate():
    # Load test data
    with open("data/test.json") as f:
        test_data = json.load(f)
    
    true_labels = []
    baseline_scores = []
    ml_scores = []
    
    print("📊 Evaluating on test set...")
    for item in test_data:
        true_labels.append(item["label"])
        baseline_scores.append(word_overlap_score(item["answer1"], item["answer2"]))
        ml_scores.append(semantic_score(item["answer1"], item["answer2"]))
    
    # Calculate metrics
    baseline_mae = mean_absolute_error(true_labels, baseline_scores)
    ml_mae = mean_absolute_error(true_labels, ml_scores)
    
    baseline_mse = mean_squared_error(true_labels, baseline_scores)
    ml_mse = mean_squared_error(true_labels, ml_scores)
    
    print("\n" + "="*50)
    print("📈 EVALUATION RESULTS")
    print("="*50)
    print(f"Test samples: {len(test_data)}")
    print()
    print("Baseline (Word Overlap):")
    print(f"  MAE:  {baseline_mae:.4f}")
    print(f"  RMSE: {np.sqrt(baseline_mse):.4f}")
    print()
    print("ML Model (Sentence Transformer):")
    print(f"  MAE:  {ml_mae:.4f}")
    print(f"  RMSE: {np.sqrt(ml_mse):.4f}")
    print()
    improvement = ((baseline_mae - ml_mae) / baseline_mae) * 100
    print(f"✨ Improvement: {improvement:.1f}%")
    print("="*50)
    
    # Plot comparison
    plt.figure(figsize=(10, 5))
    
    plt.subplot(1, 2, 1)
    plt.scatter(true_labels, baseline_scores, alpha=0.5)
    plt.plot([0, 1], [0, 1], 'r--')
    plt.xlabel('True Similarity')
    plt.ylabel('Predicted Similarity')
    plt.title(f'Baseline (MAE: {baseline_mae:.3f})')
    
    plt.subplot(1, 2, 2)
    plt.scatter(true_labels, ml_scores, alpha=0.5)
    plt.plot([0, 1], [0, 1], 'r--')
    plt.xlabel('True Similarity')
    plt.ylabel('Predicted Similarity')
    plt.title(f'ML Model (MAE: {ml_mae:.3f})')
    
    plt.tight_layout()
    plt.savefig('evaluation_results.png')
    print("\n📊 Saved comparison plot to evaluation_results.png")

if __name__ == "__main__":
    evaluate()
```

**Chạy**:
```bash
cd mlops/scorer
pip install matplotlib scikit-learn
python evaluate.py
```

---

## Step 5: Dockerize Service

**File**: `mlops/scorer/Dockerfile`

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy code and model
COPY app.py .
COPY models/ models/

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8002/health')"

# Run
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8002"]
```

**Add to main docker-compose.yml**:

```yaml
services:
  # ... existing backend, frontend ...
  
  scorer:
    build: ./mlops/scorer
    ports:
      - "8002:8002"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8002/health')"]
      interval: 30s
      timeout: 5s
      retries: 3
```

**Chạy**:
```bash
docker compose up scorer --build
```

---

## Step 6: Integrate vào Main Backend

**File**: `backend/services/scorer.py` (new file)

```python
"""Client for semantic similarity scorer service."""
import httpx
import os

SCORER_URL = os.getenv("SCORER_URL", "http://localhost:8002")

async def score_similarity(
    client: httpx.AsyncClient,
    user_answer: str,
    expected_answer: str
) -> dict:
    """
    Score semantic similarity via ML service.
    
    Returns:
        {"score": 85, "similarity": 0.85, "suggestion": "easy"}
    """
    response = await client.post(
        f"{SCORER_URL}/score",
        json={
            "user_answer": user_answer,
            "expected_answer": expected_answer
        },
        timeout=5.0
    )
    response.raise_for_status()
    return response.json()
```

**Add endpoint to `backend/main.py`**:

```python
from services.scorer import score_similarity

@app.post("/score-flashcard")
async def score_flashcard_endpoint(
    user_answer: str = Form(...),
    expected_answer: str = Form(...)
):
    """Score user's flashcard answer using ML model."""
    async with httpx.AsyncClient() as client:
        result = await score_similarity(client, user_answer, expected_answer)
        return result
```

---

## Step 7: Update Frontend to Use ML Scorer

**File**: `frontend/src/lib/api.js`

```javascript
// Add new function
export async function scoreAnswer(userAnswer, expectedAnswer) {
  const response = await fetch('/score-flashcard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      user_answer: userAnswer,
      expected_answer: expectedAnswer
    })
  });
  return response.json();
}
```

**File**: `frontend/src/pages/Flashcards.jsx`

```javascript
// Replace compareSimilarity with API call
import { scoreAnswer } from '../lib/api';

// In your voice answer check function:
const handleVoiceCheck = async () => {
  // ... existing transcription code ...
  
  // OLD: const result = compareSimilarity(transcript, expectedAnswer);
  
  // NEW: Use ML scorer
  const result = await scoreAnswer(transcript, expectedAnswer);
  
  // result = { score: 85, similarity: 0.85, suggestion: "easy" }
  // Continue with existing logic...
};
```

---

## Testing Plan

### Unit Tests

**File**: `mlops/scorer/tests/test_scorer.py`

```python
import pytest
from fastapi.testclient import TestClient
from app import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_score_identical():
    response = client.post("/score", json={
        "user_answer": "A function is reusable code",
        "expected_answer": "A function is reusable code"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["score"] >= 95  # Should be near-perfect
    assert data["suggestion"] == "easy"

def test_score_similar():
    response = client.post("/score", json={
        "user_answer": "Functions let you reuse code",
        "expected_answer": "A function is reusable code"
    })
    assert response.status_code == 200
    data = response.json()
    assert 70 <= data["score"] <= 95
    assert data["suggestion"] in ["easy", "good"]

def test_score_dissimilar():
    response = client.post("/score", json={
        "user_answer": "A loop repeats code",
        "expected_answer": "A function is reusable code"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["score"] < 50
    assert data["suggestion"] in ["hard", "again"]
```

**Chạy tests**:
```bash
pytest tests/test_scorer.py -v
```

---

## MLOps Best Practices Demonstrated

✅ **Experiment Tracking**: MLflow logs parameters, metrics, models  
✅ **Model Versioning**: Models saved with version numbers  
✅ **Model Registry**: Local registry in `models/` (can upgrade to MLflow Registry)  
✅ **Reproducibility**: Fixed random seeds, versioned data  
✅ **Serving**: FastAPI endpoint with health checks  
✅ **Containerization**: Docker for consistent deployment  
✅ **Testing**: Unit tests for API endpoints  
✅ **Monitoring**: Health checks, latency tracking (add Prometheus later)  
✅ **CI/CD Ready**: Can add GitHub Actions to automate training/deployment  

---

## Next Steps After Implementation

### Phase 1: Improve Training Data
- Extract real flashcard answers from your database
- Use LLM to generate paraphrases for more training pairs
- Add multilingual examples (Vietnamese, Thai, etc.)

### Phase 2: Advanced MLOps
- **Model Registry**: Upgrade to MLflow Model Registry with staging/production
- **A/B Testing**: Deploy v1 vs v2 models, track which performs better
- **Monitoring**: Add Prometheus metrics (latency, throughput, accuracy)
- **Auto-retraining**: Trigger training when new flashcard data arrives
- **Feature Store**: Store embeddings for faster inference

### Phase 3: Model Optimization
- **Quantization**: Reduce model size with ONNX
- **Batch Inference**: Process multiple scores in parallel
- **Caching**: Cache embeddings for frequently-used flashcards
- **GPU Support**: Deploy with CUDA for faster inference

---

## Commands Summary

```bash
# Setup
cd mlops/scorer
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Generate data
python generate_data.py

# Train model
python train.py

# View experiments
mlflow ui --port 5000

# Evaluate
python evaluate.py

# Serve locally
uvicorn app:app --reload --port 8002

# Test API
curl -X POST http://localhost:8002/score \
  -H "Content-Type: application/json" \
  -d '{"user_answer": "test", "expected_answer": "test answer"}'

# Run tests
pytest tests/ -v

# Docker
docker build -t scorer:latest .
docker run -p 8002:8002 scorer:latest

# Full stack with docker-compose
docker compose up --build
```

---

## Learning Outcomes

Sau khi hoàn thành project này, bạn sẽ nắm được:

1. ✅ **ML Training Pipeline**: Load data → train → evaluate → save
2. ✅ **Experiment Tracking**: MLflow for tracking parameters, metrics, models
3. ✅ **Model Serving**: FastAPI endpoint serving real ML model
4. ✅ **Containerization**: Docker cho ML services
5. ✅ **Integration**: Kết nối ML service vào existing app
6. ✅ **Evaluation**: So sánh ML model vs baseline
7. ✅ **Testing**: Unit tests cho ML API

Đây là foundation vững chắc để học advanced MLOps topics!
