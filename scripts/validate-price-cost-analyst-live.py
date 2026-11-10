"""Explicit opt-in live-provider smoke; saves normal analysis history.

Run in the backend container through stdin. Uses only the public governed API.
No provider keys or raw provider payloads are printed.
"""
import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from app.api.schemas.price_cost_analyst import AnalysisResponse

BASE = "http://frontend/api/v1/price-cost/analyst"
results = []


def post(question, turns=None):
    request = Request(BASE + "/query", data=json.dumps({
        "question": question, "clarification": turns or [],
    }).encode(), headers={"Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=330) as response:
            status, body = response.status, json.load(response)
    except HTTPError as error:
        status, body = error.code, json.load(error)
    record = {"question": question, "http_status": status}
    if status == 200:
        result = AnalysisResponse.model_validate(body)
        record.update(status=result.status, history_id=result.id,
                      answer=result.answer, operation=body.get("plan"),
                      row_count=result.row_count, evidence_count=len(result.evidence))
        if result.id:
            with urlopen(BASE + f"/history/{result.id}", timeout=30) as restored:
                snapshot = AnalysisResponse.model_validate(json.load(restored))
                assert snapshot.answer == result.answer
                assert snapshot.assessment_date == result.assessment_date
                assert snapshot.verified_data == result.verified_data
                record["snapshot_restore_matches"] = True
    else:
        record["detail"] = body.get("detail", "Request failed")
    results.append(record)
    print(json.dumps(record), flush=True)
    return body if status == 200 else None


for question in (
    "What is the latest diesel price in Germany including taxes?",
    "Compare annual all-items inflation in Germany and the EU-27.",
    "What is the latest EUR to GBP reference exchange rate?",
    "Forecast diesel prices next year.",
):
    post(question)
original = "Compare fuel prices"
ambiguous = post(original)
if ambiguous and ambiguous["status"] == "needs_clarification":
    prompt = ambiguous.get("clarification_question")
    if prompt:
        post(original, [{"question": prompt, "answer": "Germany and France, diesel including taxes"}])
