# VALSEA_PROJECT - Tổng Quan Kiến Trúc

## 📂 Cấu Trúc Thư Mục Tổng Thể

```
VALSEA_PROJECT/
│
├── 🎨 frontend/                    # React SPA - User Interface
│   ├── src/
│   │   ├── pages/                  # Routes: Home, Library, Quiz, Flashcards
│   │   ├── components/             # UI components
│   │   └── lib/                    # API clients, utilities
│   ├── package.json
│   └── vite.config.js
│
├── ⚙️  backend/                     # FastAPI - Main Application API
│   ├── main.py                     # API endpoints (upload, process, lectures)
│   ├── db.py                       # SQLite storage layer
│   ├── services/                   # Business logic services
│   │   ├── pipeline.py             # Audio → Transcript → Quiz pipeline
│   │   ├── transcribe.py           # Valsea STT wrapper
│   │   ├── quiz.py                 # AWS Bedrock quiz generation
│   │   ├── flashcards.py           # AWS Bedrock flashcard generation
│   │   └── scorer.py               # ← NEW: Client for ML scorer service
│   ├── tests/                      # Backend unit tests
│   ├── data/                       # SQLite database (lectures.db)
│   └── requirements.txt
│
├── 🤖 mlops/                        # ← ML/AI Training & Serving (ISOLATED)
│   │
│   ├── scorer/                     # Semantic Similarity Scorer
│   │   ├── 📊 Training Pipeline
│   │   │   ├── generate_data.py   # Generate training data
│   │   │   ├── train.py            # Train model + MLflow tracking
│   │   │   ├── evaluate.py         # Model evaluation
│   │   │   └── notebooks/          # Jupyter notebooks for experiments
│   │   │
│   │   ├── 🚀 Serving (Production)
│   │   │   ├── app.py              # FastAPI scorer endpoint
│   │   │   ├── Dockerfile          # Container for scorer service
│   │   │   └── requirements.txt
│   │   │
│   │   ├── 💾 Artifacts
│   │   │   ├── models/             # Trained models (v1, v2, ...)
│   │   │   │   └── scorer_v1/      # sentence-transformer model
│   │   │   ├── data/               # Training/test datasets
│   │   │   │   ├── train.json
│   │   │   │   └── test.json
│   │   │   └── mlruns/             # MLflow experiment tracking
│   │   │
│   │   └── tests/                  # Scorer API tests
│   │       └── test_scorer.py
│   │
│   ├── quiz-generator/             # ← FUTURE: Fine-tuned quiz LLM
│   │   ├── train.py
│   │   ├── app.py                  # Serve fine-tuned model
│   │   ├── models/
│   │   └── data/
│   │
│   ├── speech-recognition/         # ← FUTURE: Custom STT model
│   │   ├── train.py
│   │   ├── app.py
│   │   └── ...
│   │
│   └── shared/                     # ← FUTURE: Shared utilities
│       ├── monitoring.py           # Prometheus metrics
│       ├── registry.py             # Model registry client
│       └── utils.py
│
├── 📦 data/                         # ← Application-level data (not ML)
│   └── (sample uploads, cached files, etc.)
│
├── 📚 docs/                         # Documentation
│   └── (tutorials, API specs, etc.)
│
├── 🐳 Infrastructure
│   ├── docker-compose.yml          # All services orchestration
│   ├── Dockerfile                  # Main app multi-stage build
│   ├── render.yaml                 # Render.com deployment config
│   └── .env.example
│
├── 📖 Documentation
│   ├── README.md                   # Main project README
│   ├── CLAUDE.md                   # Claude Code guidance
│   ├── PROJECT_ARCHITECTURE.md     # ← This file
│   └── llm.txt                     # Valsea API reference
│
└── ⚙️  Configuration
    ├── .gitignore
    ├── .env
    └── .cursor/                    # IDE rules & skills
```

---

## 🎯 Phân Biệt `backend/` vs `mlops/`

### `backend/` - Application Backend
**Purpose**: Business logic của application chính

**Responsibilities**:
- REST API endpoints cho frontend
- Database CRUD operations
- Orchestrate external services (Valsea, Bedrock)
- **Call** ML services (không train models)

**Models**: KHÔNG có trained models ở đây
- Chỉ có model clients (gọi external APIs)

**Example**:
```python
# backend/services/scorer.py
async def score_similarity(user_answer, expected):
    # Gọi ML service, KHÔNG train model
    return await httpx.post("http://scorer:8002/score", ...)
```

---

### `mlops/` - ML Training & Serving
**Purpose**: Tất cả ML/AI models - từ training → serving

**Responsibilities**:
- Train custom ML models
- Experiment tracking (MLflow)
- Model versioning & registry
- Serve models qua dedicated APIs
- Model evaluation & monitoring

**Models**: Tất cả trained models nằm ở đây
- `mlops/scorer/models/` - Semantic similarity models
- `mlops/quiz-generator/models/` - Fine-tuned LLM
- etc.

**Example**:
```python
# mlops/scorer/train.py
model = SentenceTransformer(...)
model.fit(train_data)
model.save("models/scorer_v1")  # ← Trained model

# mlops/scorer/app.py
model = load_model("models/scorer_v1")
@app.post("/score")
def score(...):
    return model.predict(...)  # ← Serve model
```

---

## 🔄 Luồng Tương Tác

### 1. Current Flow (Using External APIs)
```
User → Frontend → Backend → Valsea API (transcribe)
                         → AWS Bedrock (quiz/flashcards)
                         → Database
```

### 2. NEW Flow (With ML Models)
```
User → Frontend → Backend → Valsea API (transcribe)
                         → AWS Bedrock (quiz/flashcards)
                         → mlops/scorer:8002 (similarity scoring) ← NEW
                         → Database
```

### 3. FUTURE Flow (All Custom Models)
```
User → Frontend → Backend → mlops/speech-recognition:8003 (custom STT)
                         → mlops/quiz-generator:8004 (fine-tuned LLM)
                         → mlops/scorer:8002 (similarity)
                         → Database
```

---

## 🐳 Docker Services Architecture

```yaml
# docker-compose.yml
services:
  # Main application
  backend:
    ports: ["8001:8001"]
    depends_on: [scorer]
    
  frontend:
    ports: ["3000:80"]
    depends_on: [backend]
  
  # ML Services (independent microservices)
  scorer:
    build: ./mlops/scorer
    ports: ["8002:8002"]
    volumes:
      - ./mlops/scorer/models:/app/models:ro
  
  # Future ML services
  quiz-generator:
    build: ./mlops/quiz-generator
    ports: ["8004:8004"]
  
  speech-recognition:
    build: ./mlops/speech-recognition
    ports: ["8003:8003"]
```

**Benefit**: Mỗi ML service độc lập, có thể:
- Deploy riêng
- Scale riêng
- Update model mà không restart backend
- Rollback từng service nếu có bug

---

## 📊 Model Storage Strategy

### ❌ ANTI-PATTERN (Don't do this)
```
backend/
  ├── services/
  │   ├── scorer_model.pkl      # ❌ Model trong backend
  │   └── quiz_model.pt         # ❌ Mixed with business logic
  └── train_scorer.py           # ❌ Training code trong backend
```

**Problems**:
- Backend phình to (models có thể >500MB)
- Mixing concerns (API logic vs ML logic)
- Khó track experiments
- Không scale được

---

### ✅ CORRECT PATTERN (Do this)
```
mlops/
  ├── scorer/                   # ✅ Isolated ML project
  │   ├── train.py              # Training code
  │   ├── app.py                # Serving code
  │   ├── models/               # Trained models
  │   │   ├── scorer_v1/        # Version 1
  │   │   ├── scorer_v2/        # Version 2
  │   │   └── scorer_v3/        # Version 3
  │   └── mlruns/               # Experiment tracking
  │
  └── quiz-generator/           # ✅ Another isolated ML project
      └── ...

backend/
  └── services/
      └── scorer.py             # ✅ Just HTTP client, no models
```

**Benefits**:
- Clear separation of concerns
- Easy to experiment with new model versions
- Backend stays lightweight
- Can reuse models across multiple apps

---

## 🗂️ Where to Put What?

### Training Code → `mlops/{project}/`
```python
# mlops/scorer/train.py
# mlops/scorer/generate_data.py
# mlops/scorer/notebooks/*.ipynb
```

### Trained Models → `mlops/{project}/models/`
```
mlops/scorer/models/
  ├── scorer_v1/              # First model
  ├── scorer_v2/              # Improved model
  └── production/             # Symlink → currently deployed
```

**Git**: Add to `.gitignore` (models are large, use registry instead)

---

### Model Serving → `mlops/{project}/app.py`
```python
# mlops/scorer/app.py - FastAPI app that loads & serves model
```

---

### Model Client → `backend/services/{service}.py`
```python
# backend/services/scorer.py - HTTP client to call ML service
async def score_similarity(...):
    return await httpx.post("http://scorer:8002/score", ...)
```

---

### Experiment Tracking → `mlops/{project}/mlruns/`
```
mlops/scorer/mlruns/
  └── 0/                      # Experiment ID
      ├── run1/               # Training run 1
      ├── run2/               # Training run 2
      └── ...
```

**Git**: Add to `.gitignore` (use MLflow server in production)

---

### Training Data → `mlops/{project}/data/`
```
mlops/scorer/data/
  ├── raw/                    # Original data
  │   └── flashcards.json
  ├── processed/              # Preprocessed data
  │   ├── train.json
  │   └── test.json
  └── README.md               # Data documentation
```

**Git**: Small datasets → commit, Large datasets → DVC or S3

---

### Application Data → `backend/data/` or `data/`
```
backend/data/
  └── lectures.db             # SQLite database (application data)

data/
  ├── uploads/                # User uploaded files
  └── cache/                  # Temporary cached data
```

---

## 🚀 Development Workflow

### Scenario 1: Train New ML Model
```bash
# Work in mlops/
cd mlops/scorer

# Generate data
python generate_data.py

# Experiment with training
python train.py

# View experiments
mlflow ui

# Evaluate
python evaluate.py

# When satisfied, serve it
uvicorn app:app --reload --port 8002
```

### Scenario 2: Develop Backend Feature
```bash
# Work in backend/
cd backend

# Add new endpoint
vim main.py

# Call ML service
vim services/scorer.py

# Test
pytest tests/
```

### Scenario 3: Full Stack Development
```bash
# Terminal 1: Backend
cd backend && uvicorn main:app --reload --port 8001

# Terminal 2: ML Service
cd mlops/scorer && uvicorn app:app --reload --port 8002

# Terminal 3: Frontend
cd frontend && npm run dev

# Terminal 4: MLflow (optional)
cd mlops/scorer && mlflow ui --port 5000
```

### Scenario 4: Docker Deployment
```bash
# All services
docker compose up --build

# Just ML service
docker compose up scorer --build

# Update model without rebuilding
cp mlops/scorer/models/scorer_v2 mlops/scorer/models/production
docker compose restart scorer
```

---

## 📋 File Ownership Map

| What | Where | Why |
|------|-------|-----|
| **Training Scripts** | `mlops/{project}/` | Isolated, can run independently |
| **Trained Models** | `mlops/{project}/models/` | Close to training code |
| **Model Serving** | `mlops/{project}/app.py` | Microservice architecture |
| **Model Client** | `backend/services/` | Backend calls ML service |
| **Experiments** | `mlops/{project}/mlruns/` | MLflow tracking data |
| **Training Data** | `mlops/{project}/data/` | Co-located with training |
| **App Data** | `backend/data/` | Business data (DB, uploads) |
| **Frontend** | `frontend/` | Calls backend API only |

---

## 🎓 Best Practices Summary

### ✅ DO
- ✅ Isolate ML projects in `mlops/`
- ✅ Each ML model = separate service
- ✅ Backend only calls ML APIs (no model code)
- ✅ Version models (v1, v2, v3)
- ✅ Track experiments with MLflow
- ✅ Use Docker for consistent environments

### ❌ DON'T
- ❌ Don't put training code in `backend/`
- ❌ Don't put trained models in `backend/`
- ❌ Don't mix ML logic with business logic
- ❌ Don't commit large models to Git
- ❌ Don't train models inside backend API

---

## 🔮 Future Growth Path

```
mlops/
├── scorer/                 # ✅ Current: Semantic similarity
│
├── quiz-generator/         # 🔜 Next: Fine-tune Mistral 7B for quiz
│   ├── train.py            # Fine-tuning script
│   ├── app.py              # vLLM or TGI serving
│   └── models/
│
├── speech-recognition/     # 🔜 Future: Custom Whisper fine-tune
│   ├── train.py            # Fine-tune for SEA accents
│   ├── app.py              # Faster-whisper serving
│   └── models/
│
├── summarization/          # 🔜 Future: Replace Valsea formatting
│   └── ...
│
├── translation/            # 🔜 Future: Custom translation model
│   └── ...
│
└── shared/                 # 🔜 Shared MLOps utilities
    ├── monitoring.py       # Prometheus metrics
    ├── registry.py         # Central model registry
    └── deployment.py       # Deployment helpers
```

---

## 🎯 Summary for Your Question

**"Training này để đâu?"**
→ `mlops/{project-name}/`

**"Models khác sẽ để đâu?"**
→ `mlops/{new-project}/`

**"Backend folder có models/ là sao?"**
→ Xóa hoặc rename. Backend không nên có trained models.

**Structure đúng:**
```
backend/          → Business logic (no ML training)
frontend/         → UI (no ML)
mlops/            → ALL ML training & serving
  ├── scorer/     → Project 1
  ├── quiz-gen/   → Project 2
  └── ...         → Project N
```

Mỗi ML project độc lập như một microservice riêng! 🚀
