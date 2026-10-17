import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import AutofillRequest, AutofillResponse
from llm import generate_answers
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)
app = FastAPI(title="ApplyAI API")

cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)

@app.post("/api/autofill", response_model=AutofillResponse)
def autofill(request: AutofillRequest) -> AutofillResponse:
    try:
        return generate_answers(request)
    except Exception as exc:
        error_type = type(exc).__name__
        logger.warning(
            "Answer generation failed (provider=%s, error_type=%s)",
            request.provider,
            error_type,
        )
        if error_type == "ServiceUnavailableError":
            raise HTTPException(
                status_code=503,
                detail=(
                    f"{request.provider} is temporarily unavailable. "
                    "Wait a moment and retry, or choose another provider in ApplyAI settings."
                ),
                headers={"Retry-After": "5"},
            ) from exc
        if error_type == "RateLimitError":
            raise HTTPException(
                status_code=429,
                detail=(
                    f"{request.provider} is rate-limiting requests. "
                    "Wait a moment and retry, or check your provider quota."
                ),
                headers={"Retry-After": "10"},
            ) from exc
        if error_type in {"Timeout", "TimeoutError", "APITimeoutError"}:
            raise HTTPException(
                status_code=504,
                detail=f"{request.provider} did not respond in time. Please retry.",
                headers={"Retry-After": "5"},
            ) from exc
        raise HTTPException(
            status_code=502,
            detail="Answer generation failed. Check provider configuration and try again.",
        ) from exc

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
