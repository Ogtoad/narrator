from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
import httpx
import os
import re
from dotenv import load_dotenv
import asyncio
import base64
from gradio_client import Client
import logging
from typing import Optional, List
from contextlib import asynccontextmanager
from fastapi.responses import ORJSONResponse
from aiocache import cached, Cache
from aiocache.serializers import PickleSerializer

# Configuration & Constants
load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
KOKORO_TTS_SPACE = os.getenv("KOKORO_TTS_SPACE", "T0adOG/Kokoro-TTS-cpu")
KOKORO_VOICE = os.getenv("KOKORO_VOICE", "af_nicole")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "nvidia/nemotron-3-nano-30b-a3b:free")

# Logging Setup - Minimal for performance
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not OPENROUTER_API_KEY:
        logger.warning("OPENROUTER_API_KEY is not set.")
    
    # Optimized HTTP Client
    limits = httpx.Limits(max_keepalive_connections=20, max_connections=100)
    app.state.http_client = httpx.AsyncClient(
        timeout=60.0,
        limits=limits,
        headers={"HTTP-Referer": "https://github.com/narrator", "X-Title": "Narrator AI"}
    )
    
    try:
        # Gradio client initialization
        app.state.gradio_client = await asyncio.get_event_loop().run_in_executor(
            None, lambda: Client(KOKORO_TTS_SPACE)
        )
    except Exception as e:
        logger.error(f"Gradio init failed: {e}")
        app.state.gradio_client = None

    yield
    await app.state.http_client.aclose()

app = FastAPI(title="Narrator API", lifespan=lifespan, default_response_class=ORJSONResponse)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

class NarrateRequest(BaseModel):
    message: Optional[str] = Field(None, max_length=1000)
    text: Optional[str] = Field(None, max_length=2000)

class SegmentResponse(BaseModel):
    text: str
    audio: Optional[str]
    audio_type: str = "audio/wav"
    error: Optional[str] = None

class NarrateResponse(BaseModel):
    segments: List[SegmentResponse]

@cached(ttl=3600, cache=Cache.MEMORY, serializer=PickleSerializer(), key_builder=lambda f, *args, **kwargs: f"text:{kwargs['message']}")
async def _generate_text_cached(message: str, http_client: httpx.AsyncClient) -> str:
    return await _generate_text_raw(message, http_client)

async def _generate_text_raw(message: str, http_client: httpx.AsyncClient) -> str:
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=503, detail="API key missing")
    
    response = await http_client.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
        json={
            "model": DEFAULT_MODEL,
            "messages": [
                {"role": "system", "content": "You are a narrator. Respond in short, dramatic sentences."},
                {"role": "user", "content": message},
            ],
            "max_tokens": 700,
        },
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]

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
        # Gradio client predict is blocking, run in executor
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: client.predict(text=text, voice=KOKORO_VOICE, speed=1.3, api_name="/predict")
        )
        # Async file read
        async with httpx.AsyncClient() as temp_client: # Using httpx for local file read is overkill but works if we want to avoid blocking
             # Actually just use standard open in executor for simplicity and speed
             def read_file(path):
                 with open(path, 'rb') as f:
                     return f.read()
             audio_data = await asyncio.get_event_loop().run_in_executor(None, read_file, result)
        
        return SegmentResponse(
            text=text,
            audio=base64.b64encode(audio_data).decode('utf-8')
        )
    except Exception as e:
        logger.error(f"TTS Error: {e}")
        return SegmentResponse(text=text, audio=None, error="TTS failed")

@app.get("/", response_class=HTMLResponse)
async def read_root():
    with open("frontend/index.html", "r") as f:
        return HTMLResponse(content=f.read())

@app.post("/api/narrate")
async def narrate(payload: NarrateRequest, request: Request):
    if payload.text:
        text = payload.text
    elif payload.message:
        text = await _generate_text_cached(message=payload.message, http_client=request.app.state.http_client)
    else:
        raise HTTPException(status_code=400, detail="Missing input")
    
    batches = _split_into_batches(text)
    client = request.app.state.gradio_client
    if not client:
        raise HTTPException(status_code=503, detail="TTS unavailable")

    # Parallel TTS processing
    tasks = [_process_tts_batch(client, batch) for batch in batches]
    segments = await asyncio.gather(*tasks)
    return {"segments": segments}

app.mount("/static", StaticFiles(directory="frontend"), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")
