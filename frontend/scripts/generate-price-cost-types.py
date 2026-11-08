"""Generate response types from the actual FastAPI OpenAPI serialization contracts.
Run from repo root: PYTHONPATH=backend backend/.venv/bin/python frontend/scripts/generate-price-cost-types.py
No database access is performed. Responses include defaulted fields (FastAPI does not exclude them).
"""
import json
import re
from pathlib import Path
from app.main import app

schemas = app.openapi()["components"]["schemas"]
roots = ["Overview", "Catalogue", "SourceStatus", "FuelResponse", "InflationResponse", "ExchangeResponse", "CountryComparison", "Evidence", "AnalysisResponse", "AnalysisHistoryItem"]
seen = set()

def name(ref):
    return re.sub(r"\W", "_", ref.rsplit("/", 1)[-1])

def ts(s):
    if "$ref" in s:
        key = s["$ref"].rsplit("/", 1)[-1]
        seen.add(key)
        return name(key)
    if "const" in s:
        return json.dumps(s["const"])
    if "enum" in s:
        return " | ".join(json.dumps(v) for v in s["enum"])
    for k in ["anyOf", "oneOf", "allOf"]:
        if k in s:
            return "(" + (" & " if k == "allOf" else " | ").join(ts(v) for v in s[k]) + ")"
    kind = s.get("type")
    if kind == "array":
        return f"Array<{ts(s['items'])}>"
    if kind == "object" or "properties" in s:
        if "properties" in s:
            return "{\n" + "\n".join(f"  {json.dumps(k)}: {ts(v)};" for k, v in s["properties"].items()) + "\n}"
        additional = s.get("additionalProperties", {})
        return f"Record<string, {ts(additional) if isinstance(additional, dict) else 'unknown'}>"
    return {"string": "string", "number": "number", "integer": "number", "boolean": "boolean", "null": "null"}.get(kind, "unknown")

seen.update(roots)
models = {}
while seen - models.keys():
    key = sorted(seen - models.keys())[0]
    models[key] = ts(schemas[key])
output = "// Generated from FastAPI OpenAPI. Decimal JSON values are strings. Do not edit by hand.\n"
output += "\n\n".join(f"export type {name(k)} = {models[k]};" for k in sorted(models)) + "\n"
Path("frontend/src/price-cost/contracts.ts").write_text(output)
print(f"Generated {len(models)} response models from {len(app.openapi()['paths'])} OpenAPI paths")
