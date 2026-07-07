"""
embeddings.py — local sentence-transformers embeddings + pgvector search.
Uses all-MiniLM-L6-v2 (384 dims, ~90MB, runs on CPU).
Switch to Bedrock later by swapping embed_text() once quota is approved.
"""
import uuid
import re
from typing import List
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

CHUNK_SIZE    = 500
CHUNK_OVERLAP = 50
TOP_K         = 4

# Module-level model cache — loaded once on first call
_embedding_model = None


def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        from sentence_transformers import SentenceTransformer
        print("Loading embedding model (all-MiniLM-L6-v2)...")
        _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
        print("Embedding model ready")
    return _embedding_model


def embed_text(text: str) -> List[float]:
    """Embed a string using all-MiniLM-L6-v2. Returns 384-dim vector."""
    model  = get_embedding_model()
    vector = model.encode(text, normalize_embeddings=True)
    return vector.tolist()


def chunk_text(text: str) -> List[str]:
    """Split text into overlapping chunks on sentence boundaries."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks    = []
    current   = ""

    for sentence in sentences:
        if len(current) + len(sentence) <= CHUNK_SIZE:
            current += " " + sentence if current else sentence
        else:
            if current:
                chunks.append(current.strip())
            overlap = current[-CHUNK_OVERLAP:] if len(current) > CHUNK_OVERLAP else current
            current = overlap + " " + sentence if overlap else sentence

    if current.strip():
        chunks.append(current.strip())

    return chunks if chunks else [text[:CHUNK_SIZE]]


async def embed_and_store(
    agent_id:   str,
    context_id: str,
    text:       str,
    db:         AsyncSession,
):
    """Chunk + embed a context document and store in pgvector."""
    from db import ContextChunk

    # Remove old chunks for this agent
    await db.execute(
        delete(ContextChunk).where(ContextChunk.agent_id == agent_id)
    )

    chunks = chunk_text(text)
    print(f"Embedding {len(chunks)} chunks for agent {agent_id}")

    for i, chunk in enumerate(chunks):
        vector = embed_text(chunk)
        row    = ContextChunk(
            id          = str(uuid.uuid4()),
            agent_id    = agent_id,
            context_id  = context_id,
            chunk_index = i,
            chunk_text  = chunk,
            embedding   = vector,
        )
        db.add(row)

    await db.commit()
    print(f"Stored {len(chunks)} vectors for agent {agent_id}")


async def similarity_search(
    agent_id: str,
    query:    str,
    db:       AsyncSession,
    top_k:    int = TOP_K,
) -> List[str]:
    """Find top_k most relevant chunks for this agent using cosine distance."""
    from db import ContextChunk

    query_vector = embed_text(query)

    result = await db.execute(
        select(ContextChunk.chunk_text)
        .where(ContextChunk.agent_id == agent_id)
        .order_by(ContextChunk.embedding.cosine_distance(query_vector))
        .limit(top_k)
    )
    rows = result.scalars().all()
    return list(rows)