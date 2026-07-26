import json
import re
import litellm
litellm.set_verbose = False

from models import AutofillRequest, AutofillResponse, FieldAnswer

def generate_answers(request: AutofillRequest) -> AutofillResponse:
    # Build a concise representation of the form fields for the prompt
    fields_desc = []
    for f in request.fields:
        f_info = f"ID: {f.id}, Type: {f.type}"
        if f.label:
            f_info += f", Label: {f.label}"
        if f.placeholder:
            f_info += f", Placeholder: {f.placeholder}"
        if f.name:
            f_info += f", Name: {f.name}"
        fields_desc.append(f_info)

    fields_str = "\n".join(fields_desc)

    jd_section = ""
    if request.job_description and request.job_description.strip():
        jd_section = f"""
The user has also provided the Job Description for this specific role. Use it to:
- Tailor the cover letter to highlight relevant experience matching the JD
- Answer "Why this company?" or "Why this role?" type questions specifically
- Prioritise skills and experiences from the resume that match the JD

JOB DESCRIPTION:
{request.job_description}
"""

    system_prompt = f"""You are an expert AI assistant that helps users autofill job applications.
You will be given the user's resume{', and the job description for the role they are applying to' if jd_section else ''}.
Your goal is to generate the most appropriate, specific, and tailored answer for each form field.

{jd_section}

CONFIDENCE SCORING RULES — You must assign a confidence level to each answer:
- "high": The answer is directly and explicitly present in the resume (name, email, phone, current company, LinkedIn URL, years of experience in a listed skill, etc.)
- "medium": The answer requires reasonable inference from the resume (e.g. describing a challenge, motivation, why this company — inferred from experience and JD)
- "low": The answer is not in the resume and had to be guessed or defaulted (e.g. salary expectations, visa status, gender, race)

OUTPUT FORMAT — Return a valid JSON object where:
- Keys are the field IDs exactly as given
- Values are objects with two keys: "value" (the string answer) and "confidence" ("high", "medium", or "low")

Example:
{{
  "_systemfield_name": {{"value": "John Doe", "confidence": "high"}},
  "salary_field": {{"value": "", "confidence": "low"}}
}}

For fields with Type "file" that ask for a Cover Letter: write a professional 3-paragraph cover letter as the "value".
For file fields that ask for a Resume: set value to "" (you cannot upload the actual PDF).
Include EVERY field ID in your response. Never omit a field.

Here is the user's resume:
{request.resume_text}
"""

    user_prompt = f"""Here are the form fields to fill out:
{fields_str}

Return ONLY the JSON object, no markdown, no explanation."""

    # Route to the correct model per provider
    model_name = "gpt-4o-mini"
    if "openai" in request.provider.lower():
        model_name = "gpt-4o-mini"
    elif "anthropic" in request.provider.lower() or "claude" in request.provider.lower():
        model_name = "claude-3-haiku-20240307"
    elif "gemini" in request.provider.lower():
        model_name = "gemini/gemini-3.6-flash"

    kwargs = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
    }

    if "gpt-4o" in model_name:
        kwargs["response_format"] = {"type": "json_object"}

    response = litellm.completion(**kwargs)
    response_content = response.choices[0].message.content

    # Parse JSON robustly
    try:
        raw = json.loads(response_content)
    except Exception:
        json_match = re.search(r'```json\s*(.*?)\s*```', response_content, re.DOTALL)
        if json_match:
            raw = json.loads(json_match.group(1))
        else:
            # Last resort: find first { ... } block
            json_match = re.search(r'\{.*\}', response_content, re.DOTALL)
            if json_match:
                raw = json.loads(json_match.group(0))
            else:
                raise ValueError(f"Failed to parse LLM response as JSON: {response_content}")

    # Normalise: some models may return flat strings, ensure FieldAnswer shape
    answers: dict[str, FieldAnswer] = {}
    for field_id, val in raw.items():
        if isinstance(val, dict):
            answers[field_id] = FieldAnswer(
                value=str(val.get("value", "")),
                confidence=val.get("confidence", "medium")
            )
        else:
            # Flat string fallback
            answers[field_id] = FieldAnswer(value=str(val), confidence="medium")

    # Process file fields — convert cover letter text to base64 .docx
    file_field_ids = {f.id for f in request.fields if f.type == "file"}
    if file_field_ids:
        try:
            from docx import Document
            import io
            import base64
            for fid in file_field_ids:
                if fid in answers and answers[fid].value and not answers[fid].value.startswith("data:"):
                    text_content = answers[fid].value
                    doc = Document()
                    for p in text_content.split("\n"):
                        if p.strip():
                            doc.add_paragraph(p.strip())
                    buffer = io.BytesIO()
                    doc.save(buffer)
                    buffer.seek(0)
                    # Save local preview copy
                    with open("Cover_Letter.docx", "wb") as f:
                        f.write(buffer.read())
                    buffer.seek(0)
                    encoded = base64.b64encode(buffer.read()).decode("utf-8")
                    answers[fid] = FieldAnswer(
                        value=f"data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,{encoded}",
                        confidence=answers[fid].confidence
                    )
        except ImportError:
            print("python-docx not installed, skipping docx generation.")

    return AutofillResponse(answers=answers)
