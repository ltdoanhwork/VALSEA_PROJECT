"""
Semantic Similarity Scorer - Text Embedding Architecture

This module provides the core model architecture for computing semantic similarity
between two texts using sentence embeddings.

Architecture:
    Input Text → Tokenizer → Encoder → Embedding Vector → Cosine Similarity → Score

Models Supported:
    - Sentence Transformers (default: all-MiniLM-L6-v2)
    - Custom fine-tuned models
    - Any HuggingFace sentence-transformers compatible model
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal, Union
import torch
import numpy as np
from sentence_transformers import SentenceTransformer, util
from dataclasses import dataclass


# Type aliases
SuggestionType = Literal["easy", "good", "hard", "again"]
EmbeddingVector = Union[torch.Tensor, np.ndarray]


@dataclass
class SimilarityScore:
    """Result of similarity computation"""
    similarity: float  # Raw cosine similarity (0.0-1.0)
    score: int  # Scaled score (0-100)
    suggestion: SuggestionType  # Spaced repetition suggestion
    confidence: float  # Confidence level (0.0-1.0)

    def to_dict(self) -> dict:
        return {
            "similarity": self.similarity,
            "score": self.score,
            "suggestion": self.suggestion,
            "confidence": self.confidence
        }


class TextEmbeddingModel:
    """
    Base class for text embedding models.

    Architecture:
        1. Text Preprocessing (handled by model tokenizer)
        2. Encoding (transformer forward pass)
        3. Pooling (mean pooling over token embeddings)
        4. Normalization (L2 norm for cosine similarity)
    """

    def __init__(self, model_name_or_path: str, device: str = None):
        """
        Initialize text embedding model.

        Args:
            model_name_or_path: HuggingFace model ID or local path
            device: Device to run model on ('cuda', 'cpu', or None for auto)
        """
        self.model_name_or_path = model_name_or_path
        self.device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = self._load_model()

    def _load_model(self) -> SentenceTransformer:
        """Load sentence transformer model"""
        print(f"Loading model: {self.model_name_or_path}")
        print(f"Device: {self.device}")

        model = SentenceTransformer(self.model_name_or_path, device=self.device)

        # Model info
        embedding_dim = model.get_sentence_embedding_dimension()
        print(f"✓ Model loaded successfully")
        print(f"  Embedding dimension: {embedding_dim}")
        print(f"  Max sequence length: {model.max_seq_length}")

        return model

    def encode(
        self,
        text: str | list[str],
        normalize: bool = True,
        convert_to_tensor: bool = True
    ) -> EmbeddingVector:
        """
        Encode text to embedding vector.

        Args:
            text: Single text or list of texts
            normalize: Whether to L2-normalize embeddings (important for cosine similarity)
            convert_to_tensor: Return torch.Tensor if True, else numpy array

        Returns:
            Embedding vector(s)

        Architecture:
            Input → Tokenize → BERT/RoBERTa Encoder → Mean Pooling → L2 Normalize → Output
        """
        return self.model.encode(
            text,
            normalize_embeddings=normalize,
            convert_to_tensor=convert_to_tensor,
            show_progress_bar=False
        )

    def get_embedding_dim(self) -> int:
        """Get embedding vector dimension"""
        return self.model.get_sentence_embedding_dimension()


class SemanticSimilarityScorer:
    """
    Semantic similarity scorer using text embeddings.

    Architecture:
        Text A → Encode → Embedding A (384-dim vector)
                                      ↓
                                 Cosine Similarity (dot product)
                                      ↓
        Text B → Encode → Embedding B (384-dim vector)
                                      ↓
                                   Score (0-100)

    Cosine Similarity:
        cos(A, B) = (A · B) / (||A|| × ||B||)

        When embeddings are normalized (L2 norm = 1):
        cos(A, B) = A · B  (simple dot product)
    """

    def __init__(
        self,
        model_name_or_path: str = "sentence-transformers/all-MiniLM-L6-v2",
        device: str = None,
        score_thresholds: dict[str, float] = None
    ):
        """
        Initialize scorer.

        Args:
            model_name_or_path: Model to use for embeddings
            device: Computing device
            score_thresholds: Custom thresholds for spaced repetition suggestions
        """
        self.embedding_model = TextEmbeddingModel(model_name_or_path, device)

        # Default thresholds for spaced repetition
        self.thresholds = score_thresholds or {
            "easy": 80,    # >= 80: Perfect/near-perfect match
            "good": 60,    # >= 60: Good understanding
            "hard": 40,    # >= 40: Partial understanding
            # < 40: "again" - needs review
        }

    def compute_similarity(
        self,
        text_a: str,
        text_b: str,
        return_embeddings: bool = False
    ) -> tuple[float, EmbeddingVector | None, EmbeddingVector | None]:
        """
        Compute cosine similarity between two texts.

        Args:
            text_a: First text
            text_b: Second text
            return_embeddings: Whether to return embedding vectors

        Returns:
            (similarity_score, embedding_a, embedding_b)
            similarity_score: float in [0.0, 1.0]
            embeddings: None if return_embeddings=False
        """
        # Encode texts to embeddings
        emb_a = self.embedding_model.encode(text_a, normalize=True, convert_to_tensor=True)
        emb_b = self.embedding_model.encode(text_b, normalize=True, convert_to_tensor=True)

        # Compute cosine similarity
        # For normalized vectors: cos_sim(A,B) = A·B
        similarity = util.cos_sim(emb_a, emb_b).item()

        # Clamp to [0, 1] range (in case of numerical errors)
        similarity = max(0.0, min(1.0, similarity))

        if return_embeddings:
            return similarity, emb_a, emb_b
        return similarity, None, None

    def score_answer(
        self,
        user_answer: str,
        expected_answer: str
    ) -> SimilarityScore:
        """
        Score user's answer against expected answer.

        Args:
            user_answer: User's spoken/written answer
            expected_answer: Expected correct answer (flashcard back)

        Returns:
            SimilarityScore with similarity, score, suggestion, confidence

        Example:
            >>> scorer = SemanticSimilarityScorer()
            >>> result = scorer.score_answer(
            ...     "Functions let you reuse code",
            ...     "A function is a reusable block of code"
            ... )
            >>> print(result.score)  # 87
            >>> print(result.suggestion)  # "easy"
        """
        # Compute similarity
        similarity, _, _ = self.compute_similarity(user_answer, expected_answer)

        # Scale to 0-100
        score = int(similarity * 100)

        # Map to spaced repetition suggestion
        suggestion = self._get_suggestion(score)

        # Compute confidence based on answer length and score
        confidence = self._compute_confidence(user_answer, expected_answer, similarity)

        return SimilarityScore(
            similarity=similarity,
            score=score,
            suggestion=suggestion,
            confidence=confidence
        )

    def _get_suggestion(self, score: int) -> SuggestionType:
        """Map score to spaced repetition suggestion"""
        if score >= self.thresholds["easy"]:
            return "easy"
        elif score >= self.thresholds["good"]:
            return "good"
        elif score >= self.thresholds["hard"]:
            return "hard"
        else:
            return "again"

    def _compute_confidence(
        self,
        user_answer: str,
        expected_answer: str,
        similarity: float
    ) -> float:
        """
        Compute confidence level for the score.

        Factors:
        - High similarity → high confidence
        - Very short answers → lower confidence
        - Length mismatch → lower confidence
        """
        # Base confidence from similarity
        confidence = similarity

        # Penalize very short user answers
        user_len = len(user_answer.split())
        if user_len < 3:
            confidence *= 0.8

        # Penalize extreme length mismatch
        expected_len = len(expected_answer.split())
        if expected_len > 0:
            length_ratio = user_len / expected_len
            if length_ratio < 0.3 or length_ratio > 3.0:
                confidence *= 0.9

        return round(confidence, 3)

    def batch_score(
        self,
        user_answers: list[str],
        expected_answers: list[str]
    ) -> list[SimilarityScore]:
        """
        Score multiple answer pairs efficiently.

        Uses batch encoding for better performance.
        """
        assert len(user_answers) == len(expected_answers), \
            "User answers and expected answers must have same length"

        # Batch encode (more efficient than one-by-one)
        user_embs = self.embedding_model.encode(user_answers, normalize=True)
        expected_embs = self.embedding_model.encode(expected_answers, normalize=True)

        # Compute similarities
        similarities = util.cos_sim(user_embs, expected_embs).diagonal().cpu().numpy()

        # Create results
        results = []
        for i, sim in enumerate(similarities):
            score = int(sim * 100)
            suggestion = self._get_suggestion(score)
            confidence = self._compute_confidence(
                user_answers[i],
                expected_answers[i],
                float(sim)
            )

            results.append(SimilarityScore(
                similarity=float(sim),
                score=score,
                suggestion=suggestion,
                confidence=confidence
            ))

        return results


class ModelRegistry:
    """
    Registry for managing multiple model versions.

    Usage:
        registry = ModelRegistry("models/")
        scorer = registry.get_model("scorer_v1")
    """

    def __init__(self, models_dir: str | Path):
        self.models_dir = Path(models_dir)
        self._cache: dict[str, SemanticSimilarityScorer] = {}

    def get_model(self, model_version: str, **kwargs) -> SemanticSimilarityScorer:
        """Load model by version (with caching)"""
        if model_version not in self._cache:
            model_path = self.models_dir / model_version
            if not model_path.exists():
                raise FileNotFoundError(f"Model not found: {model_path}")

            self._cache[model_version] = SemanticSimilarityScorer(
                model_name_or_path=str(model_path),
                **kwargs
            )

        return self._cache[model_version]

    def list_models(self) -> list[str]:
        """List available model versions"""
        if not self.models_dir.exists():
            return []
        return [d.name for d in self.models_dir.iterdir() if d.is_dir()]


# ============================================================================
# Example Usage
# ============================================================================

def example_usage():
    """Demonstrate scorer usage"""
    print("=" * 60)
    print("Semantic Similarity Scorer - Example Usage")
    print("=" * 60)

    # Initialize scorer
    print("\n1. Initializing scorer...")
    scorer = SemanticSimilarityScorer(
        model_name_or_path="sentence-transformers/all-MiniLM-L6-v2"
    )

    # Example 1: Identical texts
    print("\n2. Example: Identical texts")
    result = scorer.score_answer(
        "A function is a reusable block of code",
        "A function is a reusable block of code"
    )
    print(f"   Score: {result.score}/100")
    print(f"   Similarity: {result.similarity:.3f}")
    print(f"   Suggestion: {result.suggestion}")
    print(f"   Confidence: {result.confidence:.3f}")

    # Example 2: Paraphrase
    print("\n3. Example: Paraphrase")
    result = scorer.score_answer(
        "Functions let you reuse code",
        "A function is a reusable block of code"
    )
    print(f"   Score: {result.score}/100")
    print(f"   Suggestion: {result.suggestion}")

    # Example 3: Partially correct
    print("\n4. Example: Partially correct")
    result = scorer.score_answer(
        "It's like a method",
        "A function is a reusable block of code"
    )
    print(f"   Score: {result.score}/100")
    print(f"   Suggestion: {result.suggestion}")

    # Example 4: Wrong answer
    print("\n5. Example: Wrong answer")
    result = scorer.score_answer(
        "A loop repeats code multiple times",
        "A function is a reusable block of code"
    )
    print(f"   Score: {result.score}/100")
    print(f"   Suggestion: {result.suggestion}")

    # Example 5: Batch scoring
    print("\n6. Example: Batch scoring")
    user_answers = [
        "Functions let you reuse code",
        "A variable stores data",
        "Loops repeat actions"
    ]
    expected_answers = [
        "A function is a reusable block of code",
        "A variable holds a value in memory",
        "A loop iterates over a sequence"
    ]
    results = scorer.batch_score(user_answers, expected_answers)
    for i, res in enumerate(results):
        print(f"   Pair {i+1}: {res.score}/100 → {res.suggestion}")

    print("\n" + "=" * 60)
    print("✓ Examples completed")
    print("=" * 60)


if __name__ == "__main__":
    example_usage()
