from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel, Field, validator
import httpx
import os
import re
from dotenv import load_dotenv
import asyncio
import json
import base64
from gradio_client import Client
import logging
from typing import Optional, List
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from contextlib import asynccontextmanager

# Configuration & Constants
load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
KOKORO_TTS_SPACE = os.getenv("KOKORO_TTS_SPACE", "T0adOG/Kokoro-TTS-cpu")
KOKORO_VOICE = os.getenv("KOKORO_VOICE", "af_nicole")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

# Logging Setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Rate Limiting
limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Validate configuration
    if not OPENROUTER_API_KEY:
        logger.warning("OPENROUTER_API_KEY is not set. Chat functionality will fail.")
    
    # Initialize httpx client for reuse
    app.state.http_client = httpx.AsyncClient(
        timeout=60.0,
        headers={"HTTP-Referer": "https://github.com/narrator", "X-Title": "Narrator AI"}
    )
    
    # Initialize Gradio client for reuse
    try:
        app.state.gradio_client = await asyncio.get_event_loop().run_in_executor(
            None, lambda: Client(KOKORO_TTS_SPACE)
        )
        logger.info(f"Gradio client initialized for space: {KOKORO_TTS_SPACE}")
    except Exception as e:
        logger.error(f"Failed to initialize Gradio client: {e}")
        app.state.gradio_client = None

    yield
    
    # Shutdown
    await app.state.http_client.aclose()

app = FastAPI(title="Narrator API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CORS middleware - Restricted in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Models with Validation
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    model: str = Field(default="xiaomi/mimo-v2-flash")

    @validator('message')
    def sanitize_message(cls, v):
        return v.strip()

class NarrateRequest(BaseModel):
    message: Optional[str] = Field(None, max_length=1000)
    text: Optional[str] = Field(None, max_length=2000)
    model: str = Field(default="xiaomi/mimo-v2-flash")

class SegmentResponse(BaseModel):
    text: str
    audio: Optional[str]
    audio_type: str = "audio/wav"
    error: Optional[str] = None

class NarrateResponse(BaseModel):
    segments: List[SegmentResponse]

# Core Logic
async def _generate_text(request: ChatRequest, http_client: httpx.AsyncClient) -> str:
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=503, detail="Chat service unavailable (API key missing)")
    
    try:
        response = await http_client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
            json={
                "model": request.model,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a narrator. Respond in short, dramatic sentences. Keep responses concise and impactful, suitable for text-to-speech narration.",
                    },
                    {"role": "user", "content": request.message},
                ],
                "max_tokens": 500,
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]
    except httpx.HTTPStatusError as e:
        logger.error(f"OpenRouter API error: {e.response.text}")
        raise HTTPException(status_code=e.response.status_code, detail="Upstream chat service error")
    except Exception as e:
        logger.error(f"Unexpected error in _generate_text: {e}")
        raise HTTPException(status_code=500, detail="Internal text generation error")

def _split_into_batches(text: str, max_chars: int = 200) -> List[str]:
    normalized = re.sub(r"\s*\n+\s*", " ", text.strip())
    sentences = re.split(r'(?<=[.!?])\s+', normalized)
    batches = []
    current_batch = ""
    
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence: continue
        if current_batch and len(current_batch) + len(sentence) + 1 > max_chars:
            batches.append(current_batch)
            current_batch = sentence
        else:
            current_batch = (current_batch + " " + sentence).strip() if current_batch else sentence
    
    if current_batch:
        batches.append(current_batch)
    return batches

async def _process_tts_batch(client: Client, text: str) -> SegmentResponse:
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: client.predict(
                text=text,
                voice=KOKORO_VOICE,
                speed=1.3, # Increased speed by 30%
                api_name="/predict"
            )
        )
        
        with open(result, 'rb') as f:
            audio_data = f.read()
        
        return SegmentResponse(
            text=text,
            audio=base64.b64encode(audio_data).decode('utf-8')
        )
    except Exception as e:
        logger.error(f"TTS Error: {e}")
        return SegmentResponse(text=text, audio=None, error="TTS generation failed")

# Endpoints
@app.get("/", response_class=HTMLResponse)
async def read_root():
    try:
        with open("frontend/index.html", "r") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Frontend not found")

@app.post("/api/chat")
@limiter.limit("10/minute")
async def chat(request: Request, payload: ChatRequest):
    text = await _generate_text(payload, request.app.state.http_client)
    return {"text": text}

@app.post("/api/narrate", response_model=NarrateResponse)
@limiter.limit("5/minute")
async def narrate(request: Request, payload: NarrateRequest):
    if payload.text:
        text = payload.text
    elif payload.message:
        text = await _generate_text(ChatRequest(message=payload.message, model=payload.model), request.app.state.http_client)
    else:
        raise HTTPException(status_code=400, detail="Either message or text must be provided")
    
    batches = _split_into_batches(text)
    client = request.app.state.gradio_client
    
    if not client:
        raise HTTPException(status_code=503, detail="TTS service unavailable")

    tasks = [_process_tts_batch(client, batch) for batch in batches]
    segments = await asyncio.gather(*tasks)
    
    return NarrateResponse(segments=segments)

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return HTMLResponse(content="", status_code=204)

# Mount static files last to avoid shadowing API routes
app.mount("/static", StaticFiles(directory="frontend"), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
