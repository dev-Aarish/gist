import os
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional
import pymupdf
import chromadb
from chromadb.config import Settings as ChromaSettings
import ollama

from backend.config import settings

# Initialize ChromaDB persistent client
chroma_client = chromadb.PersistentClient(
    path=settings.chroma_persist_dir,
    settings=ChromaSettings(anonymized_telemetry=False)
)


def get_ollama_client() -> ollama.Client:
    """Return configured Ollama client."""
    return ollama.Client(host=settings.ollama_host)


def _model_name(entry: Any) -> str:
    """Read a model identifier from either a dict or an Ollama ListResponse item."""
    if isinstance(entry, dict):
        return str(entry.get("model") or entry.get("name") or "")
    return str(getattr(entry, "model", "") or getattr(entry, "name", "") or "")


def _is_embedding_model(name: str, family: Optional[str] = None, capabilities: Optional[List[str]] = None) -> bool:
    """Determine if an Ollama model is an embedding model rather than a chat model."""
    name_lower = name.lower()
    family_lower = str(family).lower() if family else ""

    if "bert" in family_lower or "nomic-bert" in family_lower:
        return True
    if any(keyword in name_lower for keyword in ["embed", "minilm", "bge-", "bge_", "arctic-embed", "embedding"]):
        return True
    if capabilities and "embedding" in capabilities and "completion" not in capabilities:
        return True
    return False


def list_installed_models() -> List[Dict[str, Any]]:
    """List chat models pulled into the local Ollama runtime, with size and family.

    Embedding-only models are excluded: they can't answer questions, so
    offering them as a chat model would just produce broken responses.
    """
    client = get_ollama_client()
    try:
        raw = client.list()
    except Exception:
        return []

    models = getattr(raw, "models", None)
    if models is None:
        models = raw.get("models", []) if isinstance(raw, dict) else []

    installed: List[Dict[str, Any]] = []
    for entry in models:
        name = _model_name(entry)
        if not name:
            continue
        size = entry.get("size") if isinstance(entry, dict) else getattr(entry, "size", None)
        details = entry.get("details") if isinstance(entry, dict) else getattr(entry, "details", None)
        capabilities = entry.get("capabilities") if isinstance(entry, dict) else getattr(entry, "capabilities", None)
        family = None
        if details is not None:
            family = (
                details.get("family")
                if isinstance(details, dict)
                else getattr(details, "family", None)
            )

        if _is_embedding_model(name, family, capabilities):
            continue

        installed.append({
            "name": name,
            "size_bytes": int(size) if isinstance(size, (int, float)) else None,
            "family": family,
        })

    installed.sort(key=lambda m: m["name"])
    return installed


def list_installed_embedding_models() -> List[str]:
    """List embedding models pulled into the local Ollama runtime."""
    client = get_ollama_client()
    try:
        raw = client.list()
    except Exception:
        return []

    models = getattr(raw, "models", None)
    if models is None:
        models = raw.get("models", []) if isinstance(raw, dict) else []

    embed_models: List[str] = []
    for entry in models:
        name = _model_name(entry)
        if not name:
            continue
        details = entry.get("details") if isinstance(entry, dict) else getattr(entry, "details", None)
        capabilities = entry.get("capabilities") if isinstance(entry, dict) else getattr(entry, "capabilities", None)
        family = None
        if details is not None:
            family = (
                details.get("family")
                if isinstance(details, dict)
                else getattr(details, "family", None)
            )

        if _is_embedding_model(name, family, capabilities):
            embed_models.append(name)

    return embed_models


CHAT_MODEL_PREFERENCES = [
    "qwen2.5:32b", "qwen2.5:14b", "qwen2.5:7b", "qwen2.5",
    "deepseek-r1:32b", "deepseek-r1:14b", "deepseek-r1:8b", "deepseek-r1:7b", "deepseek-r1",
    "llama3.3", "llama3.1:70b", "llama3.1:8b", "llama3.1",
    "mistral-nemo", "mistral:7b", "mistral",
    "gemma2:27b", "gemma2:9b", "gemma2:2b", "gemma2",
    "phi4", "phi3.5", "phi3",
    "llama3.2:3b", "llama3.2:1b", "llama3.2",
    "llama3:8b", "llama3",
    "qwen2:7b", "qwen2",
    "tinyllama"
]

EMBED_MODEL_PREFERENCES = [
    "nomic-embed-text",
    "bge-m3",
    "bge-large",
    "mxbai-embed-large",
    "all-minilm",
    "snowflake-arctic-embed",
    "bge-small"
]


def get_best_installed_chat_model() -> Optional[str]:
    """Score and return the best installed chat model based on capability tiers and parameter size."""
    installed = list_installed_models()
    if not installed:
        return None

    def model_score(item: Dict[str, Any]) -> tuple:
        name = item["name"].lower()
        # Find match index in preference list (lower index = higher priority)
        pref_rank = len(CHAT_MODEL_PREFERENCES)
        for idx, pattern in enumerate(CHAT_MODEL_PREFERENCES):
            p = pattern.lower()
            if name == p or name.startswith(f"{p}:") or (":" not in p and name.startswith(p)):
                pref_rank = idx
                break
        size = item.get("size_bytes") or 0
        # Sort key: lowest pref_rank first, then largest size_bytes
        return (pref_rank, -size)

    sorted_models = sorted(installed, key=model_score)
    return sorted_models[0]["name"]


def get_best_installed_embedding_model() -> Optional[str]:
    """Score and return the best installed embedding model."""
    installed = list_installed_embedding_models()
    if not installed:
        return None

    for pattern in EMBED_MODEL_PREFERENCES:
        p = pattern.lower()
        for name in installed:
            name_lower = name.lower()
            if name_lower == p or name_lower.startswith(f"{p}:") or name_lower.startswith(p):
                return name

    return installed[0]


def resolve_installed_model(requested: str) -> Optional[str]:
    """Match a requested chat model against what's installed, tolerating tags."""
    if not requested:
        return None
    exact = requested.strip()
    installed = [m["name"] for m in list_installed_models()]
    if exact in installed:
        return exact
    base = exact.split(":", 1)[0]
    for name in installed:
        if name == base or name.startswith(f"{base}:"):
            return name
    return None


def resolve_installed_embedding_model(requested: str) -> Optional[str]:
    """Match a requested embedding model against what's installed, tolerating tags."""
    if not requested:
        return None
    exact = requested.strip()
    installed = list_installed_embedding_models()
    if exact in installed:
        return exact
    base = exact.split(":", 1)[0]
    for name in installed:
        if name == base or name.startswith(f"{base}:"):
            return name
    return None


def get_fallback_models(exclude: Optional[str] = None) -> List[str]:
    """Return all available installed chat models excluding the given model."""
    try:
        all_models = [m["name"] for m in list_installed_models()]
        return [m for m in all_models if m != exclude]
    except Exception:
        fallback = getattr(settings, "fallback_model", None)
        return [fallback] if fallback and fallback != exclude else []


def auto_select_models() -> None:
    """
    Inspect installed Ollama models and dynamically select the best available
    chat and embedding models when offline or defaults are missing.
    """
    from backend.config import persist_selected_model

    # 1. Chat model selection
    env_llm = os.getenv("LLM_MODEL")
    if env_llm:
        resolved = resolve_installed_model(env_llm)
        if resolved:
            settings.llm_model = resolved
    else:
        # If current llm_model is not installed, select the best installed model
        if not resolve_installed_model(settings.llm_model):
            best = get_best_installed_chat_model()
            if best:
                settings.llm_model = best
                persist_selected_model(best)

    # Update fallback model to another installed model
    fallbacks = get_fallback_models(exclude=settings.llm_model)
    if fallbacks:
        settings.fallback_model = fallbacks[0]

    # 2. Embedding model selection
    env_embed = os.getenv("EMBEDDING_MODEL")
    if env_embed:
        resolved_embed = resolve_installed_embedding_model(env_embed)
        if resolved_embed:
            settings.embedding_model = resolved_embed
    else:
        if not resolve_installed_embedding_model(settings.embedding_model):
            best_embed = get_best_installed_embedding_model()
            if best_embed:
                settings.embedding_model = best_embed


def get_collection() -> chromadb.Collection:
    """Get or create the default ChromaDB collection."""
    return chroma_client.get_or_create_collection(
        name=settings.collection_name,
        metadata={"hnsw:space": "cosine"}
    )


def extract_text_from_pdf(pdf_path: str | Path) -> List[Dict[str, Any]]:
    """
    Extract text per page from a PDF document using PyMuPDF.
    Returns a list of dicts with page number, text content, and metadata.
    """
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF file not found at: {pdf_path}")

    pages_data = []
    doc = pymupdf.open(str(pdf_path))
    try:
        for page_idx in range(len(doc)):
            page = doc[page_idx]
            page_text = page.get_text("text").strip()
            if page_text:
                pages_data.append({
                    "page_number": page_idx + 1,
                    "text": page_text,
                    "source": pdf_path.name
                })
    finally:
        doc.close()

    return pages_data


def chunk_text(
    pages_data: List[Dict[str, Any]],
    chunk_size: int = settings.chunk_size,
    chunk_overlap: int = settings.chunk_overlap,
    default_topic: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Split text from pages into overlapping chunks while preserving page metadata.
    """
    chunks = []
    for page_item in pages_data:
        text = page_item["text"]
        page_num = page_item["page_number"]
        source_name = page_item["source"]

        # Clean text
        text = " ".join(text.split())

        if not text:
            continue

        start = 0
        chunk_index = 0
        while start < len(text):
            end = min(start + chunk_size, len(text))
            
            # If not at the end of text, try to split at a sentence or word boundary
            if end < len(text):
                last_punct = max(
                    text.rfind(". ", start, end),
                    text.rfind("? ", start, end),
                    text.rfind("! ", start, end),
                    text.rfind("\n", start, end)
                )
                if last_punct != -1 and last_punct > start + (chunk_size // 2):
                    end = last_punct + 1

            chunk_content = text[start:end].strip()
            if chunk_content:
                chunk_id = f"{source_name}_p{page_num}_c{chunk_index}_{uuid.uuid4().hex[:6]}"
                topic = default_topic or source_name.replace(".pdf", "").replace("_", " ").title()
                
                chunks.append({
                    "id": chunk_id,
                    "text": chunk_content,
                    "metadata": {
                        "source": source_name,
                        "page": page_num,
                        "chunk_index": chunk_index,
                        "topic": topic
                    }
                })
                chunk_index += 1

            if end >= len(text):
                break
            start = max(start + 1, end - chunk_overlap)

    return chunks


def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Generate embeddings using Ollama's embedding endpoint.
    Handles batching automatically.
    """
    if not texts:
        return []

    client = get_ollama_client()
    embeddings = []
    batch_size = 16

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        res = client.embed(model=settings.embedding_model, input=batch)
        if "embeddings" in res:
            embeddings.extend(res["embeddings"])
        else:
            raise RuntimeError(f"Failed to generate embeddings: {res}")

    return embeddings


def ingest_pdf(pdf_path: str | Path, topic: Optional[str] = None) -> Dict[str, Any]:
    """
    Full ingestion pipeline: PDF -> Text per Page -> Chunks -> Embeddings -> ChromaDB.
    """
    pdf_path = Path(pdf_path)
    pages_data = extract_text_from_pdf(pdf_path)
    if not pages_data:
        return {
            "source": pdf_path.name,
            "status": "warning",
            "message": "No text extracted from PDF (file may be empty or scanned images).",
            "chunks_indexed": 0,
            "pages": 0
        }

    chunks = chunk_text(pages_data, default_topic=topic)
    if not chunks:
        return {
            "source": pdf_path.name,
            "status": "warning",
            "message": "No text chunks generated.",
            "chunks_indexed": 0,
            "pages": len(pages_data)
        }

    texts = [c["text"] for c in chunks]
    ids = [c["id"] for c in chunks]
    metadatas = [c["metadata"] for c in chunks]

    embeddings = generate_embeddings(texts)

    collection = get_collection()
    
    # Store in ChromaDB
    collection.upsert(
        ids=ids,
        embeddings=embeddings,
        documents=texts,
        metadatas=metadatas
    )

    return {
        "source": pdf_path.name,
        "status": "success",
        "chunks_indexed": len(chunks),
        "pages": len(pages_data),
        "topic": topic or chunks[0]["metadata"]["topic"]
    }


def list_indexed_documents() -> List[Dict[str, Any]]:
    """List all indexed documents, total chunks, pages, and topics in ChromaDB."""
    collection = get_collection()
    data = collection.get(include=["metadatas"])
    
    if not data or not data["metadatas"]:
        return []

    doc_stats: Dict[str, Dict[str, Any]] = {}
    for meta in data["metadatas"]:
        source = meta.get("source", "unknown")
        page = meta.get("page", 1)
        topic = meta.get("topic", "General")

        if source not in doc_stats:
            doc_stats[source] = {
                "source": source,
                "topic": topic,
                "total_chunks": 0,
                "pages": set()
            }
        doc_stats[source]["total_chunks"] += 1
        doc_stats[source]["pages"].add(page)

    result = []
    for source, info in doc_stats.items():
        result.append({
            "source": source,
            "topic": info["topic"],
            "total_chunks": info["total_chunks"],
            "page_count": len(info["pages"])
        })
    return result


def delete_document(source: str) -> bool:
    """Delete all chunks for a specific document file from ChromaDB."""
    try:
        collection = get_collection()
        collection.delete(where={"source": source})
        return True
    except Exception:
        return False


def delete_subject(topic: str) -> bool:
    """Delete all chunks belonging to a specific subject/topic from ChromaDB."""
    try:
        collection = get_collection()
        collection.delete(where={"topic": topic})
        return True
    except Exception:
        return False


def reset_index() -> bool:
    """Clear and reset the ChromaDB collection."""
    try:
        chroma_client.delete_collection(name=settings.collection_name)
        return True
    except Exception:
        return False

