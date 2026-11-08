"""Errors raised when an upstream source no longer matches its verified contract."""


class SourceContractError(ValueError):
    """The source payload is malformed, unsupported, or structurally unexpected."""
