from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args=connect_args)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def create_session() -> Session:
    """Build a brand-new engine + session bound to DATABASE_URL, rather than reusing
    the module-level SessionLocal/engine above.

    Needed by the Prefect task (app/pipeline/prefect_flow.py): Prefect's runner
    cloudpickles the flow to hand it to a subprocess, and a function that references
    SessionLocal directly can't be pickled - it's a sessionmaker *instance* already
    bound to a live Engine, so cloudpickle must serialize it by value, which drags in
    the connection pool's (unpicklable) threading.RLock. A plain function creating its
    own engine at call time avoids ever putting a live Engine on the pickle boundary.
    """
    fresh_engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args=connect_args)
    return sessionmaker(bind=fresh_engine, autoflush=False, expire_on_commit=False)()
