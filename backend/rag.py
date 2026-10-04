import json
from typing import List, Dict, Any, Optional, Generator
from pydantic import BaseModel, Field

from backend.config import settings
from backend.ingest import (
    get_collection,
    get_ollama_client,
    generate_embeddings,
    get_fallback_models
)
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
    topic: Optional[str] = None,
    source: Optional[str] = None
) -> Dict[str, Any]:
    """
    Retrieve top-k relevant chunks from ChromaDB for the given query.
    Supports filtering by topic (subject) and/or source (specific note file).
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

    target_topic = topic
    target_source = source

    # Handle topic/source combined string (e.g. topic="sql/file.pdf" or source="sql/file.pdf")
    if target_topic and "/" in target_topic and not target_source:
        parts = target_topic.split("/", 1)
        target_topic = parts[0]
        target_source = parts[1]
    elif target_source and "/" in target_source and not target_topic:
        parts = target_source.split("/", 1)
        target_topic = parts[0]
        target_source = parts[1]

    where_conditions = []
    if target_topic:
        where_conditions.append({"topic": target_topic})
    if target_source:
        where_conditions.append({"source": target_source})

    where_clause = None
    if len(where_conditions) == 1:
        where_clause = where_conditions[0]
    elif len(where_conditions) > 1:
        where_clause = {"$and": where_conditions}

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
        
        doc_source = meta.get("source", "Uploaded Document")
        page = meta.get("page", 1)
        doc_topic = meta.get("topic", "General")
        
        # Snippet for citation
        snippet = doc_text[:250] + ("..." if len(doc_text) > 250 else "")

        citation = Citation(
            source=doc_source,
            page=page,
            topic=doc_topic,
            text_snippet=snippet,
            score=round(1.0 - (distance if distance is not None else 0.0), 3)
        )
        citations.append(citation)

        context_blocks.append(
            f"[Source: {doc_source}, Page: {page}, Topic: {doc_topic}]\n{doc_text}"
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
    topic: Optional[str] = None,
    source: Optional[str] = None
) -> AskResponse:
    """
    RAG pipeline: retrieve relevant context chunks and generate a grounded answer.
    """
    retrieval = retrieve_context(query=question, top_k=top_k, topic=topic, source=source)
    
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
    options = {
        "temperature": settings.rag_temperature,
        "num_predict": settings.max_predict_tokens
    }

    models_to_try = [settings.llm_model]
    for fb in get_fallback_models(exclude=settings.llm_model):
        if fb not in models_to_try:
            models_to_try.append(fb)

    answer_text = None
    used_model = settings.llm_model
    last_error = None

    for model_name in models_to_try:
        try:
            response = client.chat(
                model=model_name,
                messages=[
                    {"role": "system", "content": RAG_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                options=options,
                keep_alive=settings.keep_alive
            )
            answer_text = response["message"]["content"].strip()
            used_model = model_name
            break
        except Exception as e:
            last_error = e
            continue

    if answer_text is None:
        raise RuntimeError(f"Error querying LLM via Ollama: {str(last_error)}")

    return AskResponse(
        answer=answer_text,
        sources=retrieval["citations"],
        model=used_model,
        has_notes=True
    )


def stream_ask_question(
    question: str,
    top_k: int = settings.top_k_retrieval,
    topic: Optional[str] = None,
    source: Optional[str] = None
) -> Generator[str, None, None]:
    """
    RAG streaming generator yielding Server-Sent Events (SSE) JSON payloads for real-time streaming.
    """
    retrieval = retrieve_context(query=question, top_k=top_k, topic=topic, source=source)
    
    if retrieval["total_chunks"] == 0:
        msg = "No study materials found. Please upload your course notes or PDFs first to start asking questions!"
        yield f"data: {json.dumps({'type': 'sources', 'sources': [], 'model': settings.llm_model, 'has_notes': False})}\n\n"
        yield f"data: {json.dumps({'type': 'token', 'token': msg})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'answer': msg})}\n\n"
        return

    if not retrieval["context_text"]:
        msg = "I could not find any relevant sections in your uploaded notes to answer this question."
        yield f"data: {json.dumps({'type': 'sources', 'sources': [], 'model': settings.llm_model, 'has_notes': True})}\n\n"
        yield f"data: {json.dumps({'type': 'token', 'token': msg})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'answer': msg})}\n\n"
        return

    # Send citations immediately
    sources_data = [s.model_dump() for s in retrieval["citations"]]
    yield f"data: {json.dumps({'type': 'sources', 'sources': sources_data, 'model': settings.llm_model, 'has_notes': True})}\n\n"

    user_prompt = RAG_USER_PROMPT.format(
        context=retrieval["context_text"],
        question=question
    )

    client = get_ollama_client()
    options = {
        "temperature": settings.rag_temperature,
        "num_predict": settings.max_predict_tokens
    }

    def _extract_token(chunk: Any) -> str:
        if isinstance(chunk, dict):
            return chunk.get("message", {}).get("content", "")
        msg_obj = getattr(chunk, "message", None)
        if msg_obj:
            return getattr(msg_obj, "content", "")
        return ""

    models_to_try = [settings.llm_model]
    for fb in get_fallback_models(exclude=settings.llm_model):
        if fb not in models_to_try:
            models_to_try.append(fb)

    stream_success = False
    last_error = None

    for model_name in models_to_try:
        try:
            full_tokens: List[str] = []
            stream = client.chat(
                model=model_name,
                messages=[
                    {"role": "system", "content": RAG_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                options=options,
                stream=True,
                keep_alive=settings.keep_alive
            )
            for chunk in stream:
                token = _extract_token(chunk)
                if token:
                    full_tokens.append(token)
                    yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"

            yield f"data: {json.dumps({'type': 'done', 'answer': ''.join(full_tokens), 'model': model_name})}\n\n"
            stream_success = True
            break

        except Exception as err:
            last_error = err
            continue

    if not stream_success:
        yield f"data: {json.dumps({'type': 'error', 'error': str(last_error)})}\n\n"

