"""Immutable, content-addressed raw responses. No automatic garbage collection."""

import hashlib
import os
import re
import tempfile
from pathlib import Path


class ArtifactStore:
    def __init__(self, root: str | Path):
        self.root = Path(root).resolve()

    def put(self, source: str, payload: bytes, extension: str) -> tuple[str, str]:
        if not re.fullmatch(r"[a-z][a-z0-9_]{0,39}", source):
            raise ValueError("Unsafe artifact source")
        if extension not in {"xlsx", "json", "csv", "html"} or not payload:
            raise ValueError("Invalid artifact format or empty response")
        digest = hashlib.sha256(payload).hexdigest()
        relative = Path("raw") / source / f"{digest}.{extension}"
        target = self.root / relative
        if not target.resolve().is_relative_to(self.root):
            raise ValueError("Artifact path escapes storage root")
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            if target.is_symlink() or hashlib.sha256(target.read_bytes()).hexdigest() != digest:
                raise ValueError("Stored artifact hash mismatch")
            return digest, str(relative)
        fd, temporary = tempfile.mkstemp(dir=target.parent, prefix=".download-")
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(payload)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, target)
            directory = os.open(target.parent, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        finally:
            Path(temporary).unlink(missing_ok=True)
        return digest, str(relative)
