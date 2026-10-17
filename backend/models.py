from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

class FormField(BaseModel):
    id: str = Field(min_length=1, max_length=256)
    name: Optional[str] = Field(default=None, max_length=512)
    type: str = Field(min_length=1, max_length=64)
    placeholder: Optional[str] = Field(default=None, max_length=2048)
    label: Optional[str] = Field(default=None, max_length=2048)
    options: List[str] = Field(default_factory=list, max_length=50)

class AutofillRequest(BaseModel):
    fields: List[FormField] = Field(min_length=1, max_length=100)
    resume_text: str = Field(min_length=1, max_length=50000)
    provider: Literal["openai", "anthropic", "claude", "gemini"] = "openai"

    @field_validator("resume_text")
    @classmethod
    def reject_blank_resume(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("resume_text must not be blank")
        return value

    @model_validator(mode="after")
    def reject_duplicate_field_ids(self) -> "AutofillRequest":
        field_ids = [field.id for field in self.fields]
        if len(field_ids) != len(set(field_ids)):
            raise ValueError("field IDs must be unique")
        return self

class AutofillResponse(BaseModel):
    answers: Dict[str, str]
    evidence: Dict[str, str]
