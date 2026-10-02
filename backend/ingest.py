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

