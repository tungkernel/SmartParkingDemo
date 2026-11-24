from __future__ import annotations

from fastapi import APIRouter

from api.v1.routers import (
    analytics,
    billing,
    directory,
    health,
    infrastructure,
    passes,
    turns,
)


def build_v1_router() -> APIRouter:
    router = APIRouter()
    router.include_router(health.router)
    router.include_router(infrastructure.router)
    router.include_router(turns.router)
    router.include_router(billing.router)
    router.include_router(passes.router)
    router.include_router(directory.router)
    router.include_router(analytics.router)
    return router
