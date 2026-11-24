from __future__ import annotations


class ValidationError(ValueError):
    """Raised when input or state violates domain/schema constraints (HTTP 400)."""


class NotFoundError(ValidationError):
    """Raised when a requested domain entity does not exist (HTTP 404)."""


class ConflictError(ValidationError):
    """Raised when an operation conflicts with current entity state (HTTP 409)."""


class DatabaseError(RuntimeError):
    """Raised when a database connection, transaction, or query fails (HTTP 503)."""
