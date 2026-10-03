import json
import os
from pathlib import Path
from pydantic import BaseModel, Field

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
CHROMA_DIR = DATA_DIR / "chroma"
DB_PATH = DATA_DIR / "tracker.db"
MODEL_CONFIG_PATH = DATA_DIR / "model_config.json"

# Ensure data directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)


class Settings(BaseModel):
    # Ollama Configuration
    ollama_host: str = Field(default_factory=lambda: os.getenv("OLLAMA_HOST", "http://localhost:11434"))
    llm_model: str = Field(default_factory=lambda: os.getenv("LLM_MODEL", "qwen2.5:7b"))
    fallback_model: str = Field(default_factory=lambda: os.getenv("FALLBACK_MODEL", "llama3.2:3b"))
    embedding_model: str = Field(default_factory=lambda: os.getenv("EMBEDDING_MODEL", "nomic-embed-text:latest"))
    keep_alive: str = "30m"

    # Ingestion & Chunking
    chunk_size: int = 600  # characters per chunk
    chunk_overlap: int = 100  # overlap between consecutive chunks

    # Retrieval & RAG
    top_k_retrieval: int = 3
    max_predict_tokens: int = 400
    rag_temperature: float = 0.2
    quiz_temperature: float = 0.6

    # Paths and persistence
    chroma_persist_dir: str = str(CHROMA_DIR)
    collection_name: str = "exam_buddy_collection"
    sqlite_db_path: str = str(DB_PATH)
    upload_dir: str = str(UPLOAD_DIR)


def _load_saved_model(default: str) -> str:
    """Return the model the user last selected, if it was persisted.

    `LLM_MODEL` in the environment still wins, so the config file only fills in
    when the env var is absent. A corrupt or missing file falls back silently.
    """
    if os.getenv("LLM_MODEL"):
        return os.getenv("LLM_MODEL")
    try:
        saved = json.loads(MODEL_CONFIG_PATH.read_text())
        model = saved.get("llm_model")
        if isinstance(model, str) and model.strip():
            return model.strip()
    except (OSError, ValueError):
        pass
    return default


def persist_selected_model(model: str) -> None:
    """Write the chosen model to disk so the choice survives a restart."""
    try:
        MODEL_CONFIG_PATH.write_text(json.dumps({"llm_model": model}, indent=2))
    except OSError:
        # Persistence is a convenience; a read-only data dir shouldn't break selection.
        pass


settings = Settings()
settings.llm_model = _load_saved_model(settings.llm_model)
