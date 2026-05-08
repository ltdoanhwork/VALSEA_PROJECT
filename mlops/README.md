# MLOps Projects

This directory contains all ML/AI model training and serving projects.

## Philosophy

Each subdirectory is an **independent ML microservice** with:
- Training pipeline
- Model versioning
- Experiment tracking (MLflow)
- Serving API (FastAPI)
- Docker containerization

## Current Projects

### 🎯 [scorer/](./scorer/)
**Semantic Similarity Scorer** - Compares user answers with expected answers using sentence transformers.

- **Status**: In development
- **Model**: sentence-transformers/all-MiniLM-L6-v2
- **Serving**: FastAPI on port 8002
- **Docs**: [scorer/README.md](./scorer/README.md)

## Future Projects

### 🧠 quiz-generator/
Fine-tuned LLM for quiz generation (replace AWS Bedrock)

- **Model**: Mistral 7B or Llama 3
- **Serving**: vLLM or TGI
- **Port**: 8004

### 🎤 speech-recognition/
Custom STT model fine-tuned for SEA accents

- **Model**: Whisper fine-tuned
- **Serving**: Faster-whisper
- **Port**: 8003

### 📝 summarization/
Lecture summarization model (replace Valsea formatting)

- **Model**: T5 or BART fine-tuned
- **Port**: 8005

## Project Structure Template

```
mlops/{project-name}/
├── README.md                    # Overview & quick start
├── docs/                        # Detailed documentation
│   ├── IMPLEMENTATION_PLAN.md   # Step-by-step guide
│   └── ARCHITECTURE.md          # Technical details
├── requirements.txt
├── train.py                     # Training pipeline
├── evaluate.py                  # Model evaluation
├── app.py                       # FastAPI serving
├── Dockerfile
├── data/                        # Training data
├── models/                      # Saved models
├── mlruns/                      # MLflow experiments
└── tests/                       # Unit tests
```

## Development Workflow

### 1. Train a Model

```bash
cd mlops/{project}/
python train.py
mlflow ui --port 5000  # View experiments
```

### 2. Serve Locally

```bash
uvicorn app:app --reload --port 800X
```

### 3. Test API

```bash
curl -X POST http://localhost:800X/predict \
  -H "Content-Type: application/json" \
  -d '{"input": "test data"}'
```

### 4. Deploy with Docker

```bash
# Build image
docker build -t {project}:latest .

# Run container
docker run -p 800X:800X {project}:latest

# Or use docker-compose (from project root)
docker compose up {project} --build
```

## Integration with Main App

ML services are called from `backend/services/{service}.py`:

```python
# backend/services/scorer.py
import httpx

async def score_similarity(user_answer, expected):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://scorer:8002/score",  # Docker service name
            json={"user_answer": user_answer, "expected_answer": expected}
        )
        return response.json()
```

## Best Practices

### ✅ DO
- Keep each ML project isolated
- Use MLflow for experiment tracking
- Version your models (v1, v2, v3)
- Write tests for serving APIs
- Document data preprocessing steps
- Use Docker for reproducibility

### ❌ DON'T
- Don't put training code in `backend/`
- Don't commit large model files to Git
- Don't mix ML logic with business logic
- Don't train models in production containers

## Port Assignments

| Service | Port | Status |
|---------|------|--------|
| Main Backend | 8001 | ✅ Active |
| Scorer | 8002 | 🚧 In Dev |
| Speech Recognition | 8003 | 📋 Planned |
| Quiz Generator | 8004 | 📋 Planned |
| Summarization | 8005 | 📋 Planned |

## Resources

- **MLflow Documentation**: https://mlflow.org/docs/latest/
- **FastAPI**: https://fastapi.tiangolo.com/
- **Sentence Transformers**: https://www.sbert.net/
- **Docker Best Practices**: https://docs.docker.com/develop/dev-best-practices/
