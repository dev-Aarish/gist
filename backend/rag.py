from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

from backend.config import settings
from backend.ingest import get_collection, get_ollama_client, generate_embeddings
from backend.prompts import RAG_SYSTEM_PROMPT, RAG_USER_PROMPT


class Citation(BaseModel):
    source: str
    page: int
    topic: Optional[str] = None
    text_snippet: str
    score: Optional[float] = None


class AskResponse(BaseModel):
    answer: str
    sources: List[Citation] = Field(default_factory=list)
    model: str
    has_notes: bool = True


def retrieve_context(
    query: str,
    top_k: int = settings.top_k_retrieval,
    topic: Optional[str] = None
) -> Dict[str, Any]:
    """
    Retrieve top-k relevant chunks from ChromaDB for the given query.
    """
    collection = get_collection()
    
    # Check if collection is empty
    count = collection.count()
    if count == 0:
        return {"context_text": "", "citations": [], "total_chunks": 0}

    # Generate query embedding
    query_embeddings = generate_embeddings([query])
    if not query_embeddings:
        return {"context_text": "", "citations": [], "total_chunks": count}

    where_clause = None
    if topic:
        where_clause = {"topic": topic}

    # Query ChromaDB
    results = collection.query(
        query_embeddings=query_embeddings,
        n_results=min(top_k, count),
        where=where_clause,
        include=["documents", "metadatas", "distances"]
    )

    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    citations: List[Citation] = []
    context_blocks: List[str] = []

    for idx, doc_text in enumerate(documents):
        meta = metadatas[idx] if idx < len(metadatas) else {}
        distance = distances[idx] if idx < len(distances) else None
        
        source = meta.get("source", "Uploaded Document")
        page = meta.get("page", 1)
        doc_topic = meta.get("topic", "General")
        
        # Snippet for citation
        snippet = doc_text[:250] + ("..." if len(doc_text) > 250 else "")

        citation = Citation(
            source=source,
            page=page,
            topic=doc_topic,
            text_snippet=snippet,
            score=round(1.0 - (distance if distance is not None else 0.0), 3)
        )
        citations.append(citation)

        context_blocks.append(
            f"[Source: {source}, Page: {page}, Topic: {doc_topic}]\n{doc_text}"
        )

    context_text = "\n\n".join(context_blocks)
    return {
        "context_text": context_text,
        "citations": citations,
        "total_chunks": count
    }


def ask_question(
    question: str,
    top_k: int = settings.top_k_retrieval,
    topic: Optional[str] = None
) -> AskResponse:
    """
    RAG pipeline: retrieve relevant context chunks and generate a grounded answer.
    """
    retrieval = retrieve_context(query=question, top_k=top_k, topic=topic)
    
    if retrieval["total_chunks"] == 0:
        return AskResponse(
            answer="No study materials found. Please upload your course notes or PDFs first to start asking questions!",
            sources=[],
            model=settings.llm_model,
            has_notes=False
        )

    if not retrieval["context_text"]:
        return AskResponse(
            answer="I could not find any relevant sections in your uploaded notes to answer this question.",
            sources=[],
            model=settings.llm_model,
            has_notes=True
        )

    user_prompt = RAG_USER_PROMPT.format(
        context=retrieval["context_text"],
        question=question
    )

    client = get_ollama_client()
    try:
        response = client.chat(
            model=settings.llm_model,
            messages=[
                {"role": "system", "content": RAG_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            options={
                "temperature": settings.rag_temperature
            },
            keep_alive=settings.keep_alive
        )
        answer_text = response["message"]["content"].strip()
    except Exception as e:
        # Try fallback model if primary fails
        try:
            response = client.chat(
                model=settings.fallback_model,
                messages=[
                    {"role": "system", "content": RAG_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                options={
                    "temperature": settings.rag_temperature
                },
                keep_alive=settings.keep_alive
            )
            answer_text = response["message"]["content"].strip()
        except Exception:
            raise RuntimeError(f"Error querying LLM via Ollama: {str(e)}")

    return AskResponse(
        answer=answer_text,
        sources=retrieval["citations"],
        model=settings.llm_model,
        has_notes=True
    )
