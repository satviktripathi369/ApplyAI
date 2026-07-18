import json
from litellm import completion
from models import AutofillRequest, AutofillResponse

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
    
    system_prompt = f"""You are an expert AI assistant that helps users autofill job applications.
You will be provided with the user's resume, and a list of form fields extracted from a job application.
Your goal is to generate the most appropriate answer for each field based on the resume.

For fields with Type: "file", you must generate the text content for the file. 
If the file field asks for a "Cover Letter" (based on Label/Name), generate a professional, tailored 3-paragraph cover letter based on the resume.

Output a valid JSON object where keys are the field IDs and values are the string answers.
If a field asks for something not in the resume (e.g. expected salary, visa status), provide a sensible default or leave it empty, but you must include every field ID in your JSON response.

Here is the user's resume:
{request.resume_text}
"""

    user_prompt = f"""Here are the form fields to fill out:
{fields_str}

Return ONLY a JSON object mapping each field ID to its generated answer."""

    import litellm
    litellm.set_verbose = True
    
    # Set up the API key for the chosen provider via environment variables temporarily or pass it directly
    # litellm allows passing api_key directly in completion
    model_name = "gpt-4o-mini" # default to fast/cheap model
    if "openai" in request.provider.lower():
        model_name = "gpt-4o-mini"
    elif "anthropic" in request.provider.lower() or "claude" in request.provider.lower():
        model_name = "claude-3-haiku-20240307"
    elif "gemini" in request.provider.lower():
        model_name = "gemini/gemini-3.5-flash"

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
    try:
        answers_dict = json.loads(response_content)
    except Exception as e:
        # Fallback if the model didn't return perfect JSON
        import re
        json_match = re.search(r'```json\n(.*?)\n```', response_content, re.DOTALL)
        if json_match:
            answers_dict = json.loads(json_match.group(1))
        else:
            raise ValueError(f"Failed to parse LLM response as JSON: {response_content}")

    # Process file fields to base64 docx
    file_field_ids = {f.id for f in request.fields if f.type == 'file'}
    if file_field_ids:
        try:
            from docx import Document
            import io
            import base64
            for fid in file_field_ids:
                if fid in answers_dict and answers_dict[fid]:
                    text_content = answers_dict[fid]
                    doc = Document()
                    for p in text_content.split('\n'):
                        if p.strip():
                            doc.add_paragraph(p.strip())
                    buffer = io.BytesIO()
                    doc.save(buffer)
                    buffer.seek(0)
                    
                    # Save a copy locally so the user can easily check it
                    with open("latest_cover_letter.docx", "wb") as f:
                        f.write(buffer.read())
                    buffer.seek(0)
                    
                    encoded = base64.b64encode(buffer.read()).decode('utf-8')
                    answers_dict[fid] = f"data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,{encoded}"
        except ImportError:
            print("python-docx not installed, skipping docx generation.")

    return AutofillResponse(answers=answers_dict)
