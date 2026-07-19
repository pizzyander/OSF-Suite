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


def get_context_owner_id(agent) -> str:
    """
    Returns the key that context storage/retrieval is scoped to.

    Individual accounts (agent.org_id is None) are scoped to their own
    agent id, exactly as before this change. Org members are scoped to
    their org_id instead — every rep in the org shares one pool of
    context rather than each uploading the same pricing sheet separately.

    NOTE: ContextChunk's DB column is still literally named `agent_id`
    (we don't have db_vectors.py to safely rename it in this pass) — for
    org accounts, this function returns the org_id and that value gets
    stored INTO that agent_id column. It's a values-only reinterpretation
    of an existing column, not a schema change. Works safely because
    agent ids and org ids are both uuid4 strings drawn from separate
    generation calls, so they never collide.
    """
    return agent.org_id if agent.org_id else agent.id


async def embed_and_store(
    owner_id:   str,
    context_id: str,
    text:       str,
    db:         AsyncSession,
):
    """
    Chunk + embed a context document and store in pgvector, scoped to
    owner_id — either an individual agent's id, or an org's id for shared
    team context. Caller resolves which one via get_context_owner_id().
    """
    from db import ContextChunk

    # Remove old chunks for this owner (agent or org)
    await db.execute(
        delete(ContextChunk).where(ContextChunk.agent_id == owner_id)
    )

    chunks = chunk_text(text)
    print(f"Embedding {len(chunks)} chunks for owner {owner_id}")

    for i, chunk in enumerate(chunks):
        vector = embed_text(chunk)
        row    = ContextChunk(
            id          = str(uuid.uuid4()),
            agent_id    = owner_id,
            context_id  = context_id,
            chunk_index = i,
            chunk_text  = chunk,
            embedding   = vector,
        )
        db.add(row)

    await db.commit()
    print(f"Stored {len(chunks)} vectors for owner {owner_id}")


async def similarity_search(
    owner_id: str,
    query:    str,
    db:       AsyncSession,
    top_k:    int = TOP_K,
) -> List[str]:
    """
    Find top_k most relevant chunks for this owner (agent or org) using
    cosine distance. Caller resolves owner_id via get_context_owner_id().
    """
    from db import ContextChunk

    query_vector = embed_text(query)

    result = await db.execute(
        select(ContextChunk.chunk_text)
        .where(ContextChunk.agent_id == owner_id)
        .order_by(ContextChunk.embedding.cosine_distance(query_vector))
        .limit(top_k)
    )
    rows = result.scalars().all()
    return list(rows)