from pydantic import BaseModel, Field
from typing import List, Dict, Optional

class FormField(BaseModel):
    id: str
    name: Optional[str] = None
    type: str
    placeholder: Optional[str] = None
    label: Optional[str] = None

class AutofillRequest(BaseModel):
    fields: List[FormField]
    resume_text: str
    provider: str = Field(default="openai", description="e.g., openai, anthropic, gemini")
    job_description: Optional[str] = Field(default=None, description="Job description text for tailored answers")

class FieldAnswer(BaseModel):
    value: str
    confidence: str = Field(description="high | medium | low")

class AutofillResponse(BaseModel):
    # Mapping of field id to its answer with confidence score
    answers: Dict[str, FieldAnswer]
