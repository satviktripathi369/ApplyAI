from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

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
    api_key: str

class AutofillResponse(BaseModel):
    # Mapping of field id to the generated string value
    answers: Dict[str, str]
