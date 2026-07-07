from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer
from pgvector.sqlalchemy import Vector


ContextChunk = None


def init_vectors(Base):
    global ContextChunk

    class _ContextChunk(Base):
        __tablename__ = "context_chunks"

        id          = Column(String, primary_key=True)
        agent_id    = Column(String, nullable=False, index=True)
        context_id  = Column(String, nullable=False, index=True)
        chunk_index = Column(Integer, nullable=False)
        chunk_text  = Column(Text, nullable=False)
        embedding   = Column(Vector(384), nullable=False)  # MiniLM = 384 dims
        created_at  = Column(DateTime, default=datetime.utcnow)

    ContextChunk = _ContextChunk
    return ContextChunk