---
skill: mlops-learner
description: Remind Claude about user's MLOps learning goals and provide guidance
globs: ["**/*.py", "**/*.yml", "**/*.yaml", "Dockerfile", "docker-compose.yml"]
---

# MLOps Learning Goals

The user is actively learning MLOps with these specific objectives:

## Learning Focus Areas

1. **Model Serving** — Deploy real ML models to production endpoints
2. **MLOps Pipeline** — End-to-end ML workflow automation (training → deployment → monitoring)
3. **Infrastructure** — Docker, Kubernetes, model registries, CI/CD for ML
4. **Real-world Implementation** — Not just theory, but actual deployable systems

## Current Project Context

This project (Lecture2Quiz SEA) already demonstrates some MLOps concepts:
- ✅ Using external AI APIs (Valsea, AWS Bedrock)
- ✅ Docker containerization
- ✅ FastAPI for serving ML-powered endpoints
- ✅ Async pipeline orchestration
- ✅ Error handling and retries

## What's Missing for Full MLOps

The user should learn:
- Training and versioning their own models (not just API calls)
- Model registry (MLflow, DVC, or Weights & Biases)
- Experiment tracking
- Model monitoring and drift detection
- A/B testing infrastructure
- Feature stores
- Model serving frameworks (TorchServe, TensorFlow Serving, BentoML, Ray Serve)

## When Helping with MLOps

- Prioritize **practical, deployable** solutions over theory
- Show real code examples with Docker/K8s configs
- Focus on serving models via REST APIs (FastAPI is good foundation)
- Include monitoring and logging from day one
- Emphasize reproducibility and versioning

## Next Steps Roadmap

See the guidance provided in the main conversation for detailed steps.
