from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import AutofillRequest, AutofillResponse
from llm import generate_answers
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="ApplyAI API")

# Allow the Chrome extension to make requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to chrome-extension://<id>
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/autofill", response_model=AutofillResponse)
async def autofill(request: AutofillRequest):
    try:
        if not request.fields:
            raise HTTPException(status_code=400, detail="No fields provided")
        
        response = generate_answers(request)
        return response
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
