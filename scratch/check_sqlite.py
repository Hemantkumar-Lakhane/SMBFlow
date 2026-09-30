import asyncio
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.ext.asyncio import create_async_engine
from db.models.core import Base as OrgBase
from core.state_manager import Base as StateBase

@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    return compiler.visit_JSON(JSON(), **kw)

async def test_sqlite():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        try:
            await conn.run_sync(OrgBase.metadata.create_all)
            await conn.run_sync(StateBase.metadata.create_all)
            print("Both OrgBase and StateBase create_all succeeded!")
        except Exception as e:
            print("SQLite create_all error:", type(e), e)

if __name__ == '__main__':
    asyncio.run(test_sqlite())

