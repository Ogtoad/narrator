from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel
import httpx
import os
from dotenv import load_dotenv
import asyncio
import json

load_dotenv()

app = FastAPI(title="Narrator API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="frontend"), name="static")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
KOKORO_TTS_URL = os.getenv("KOKORO_TTS_URL", "https://api-inference.huggingface.co/models/hexgrad/Kokoro-82M")
HF_API_KEY = os.getenv("HF_API_KEY")


class ChatRequest(BaseModel):
    message: str
    model: str = "xiaomi/mimo-v2-flash"


class NarratorResponse(BaseModel):
    text: str
    audio_url: str


@app.get("/", response_class=HTMLResponse)
async def read_root():
    """Serve the main HTML page"""
    with open("frontend/index.html", "r") as f:
        return HTMLResponse(content=f.read())


@app.post("/api/chat")
async def chat(request: ChatRequest):
    """
    Generate AI response using OpenRouter API
    Returns text in subtitle-like format
    """
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OpenRouter API key not configured")
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": request.model,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a narrator. Respond in short, dramatic subtitle-style sentences. Keep responses concise and impactful, suitable for text-to-speech narration."
                        },
                        {
                            "role": "user",
                            "content": request.message
                        }
                    ],
                    "max_tokens": 500,
                }
            )
            response.raise_for_status()
            data = response.json()
            
            text = data["choices"][0]["message"]["content"]
            return {"text": text}
            
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"OpenRouter API error: {str(e)}")


@app.post("/api/tts")
async def text_to_speech(text: str):
    """
    Convert text to speech using Kokoro TTS on HuggingFace
    Voice: Bella (af_bella)
    """
    if not HF_API_KEY:
        raise HTTPException(status_code=500, detail="HuggingFace API key not configured")
    
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            # Kokoro TTS API call with Bella voice
            response = await client.post(
                KOKORO_TTS_URL,
                headers={
                    "Authorization": f"Bearer {HF_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "inputs": text,
                    "parameters": {
                        "voice": "af_bella",  # Bella voice
                        "speed": 1.0,
                        "lang": "en-us"
                    }
                }
            )
            response.raise_for_status()
            
            # Return audio as streaming response
            return StreamingResponse(
                iter([response.content]),
                media_type="audio/wav",
                headers={
                    "Content-Disposition": "attachment; filename=narration.wav"
                }
            )
            
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"TTS API error: {str(e)}")


@app.post("/api/narrate")
async def narrate(request: ChatRequest):
    """
    Combined endpoint: Generate text and audio
    Returns both text and audio data
    Voice: Bella (af_bella)
    """
    # Get text response
    chat_response = await chat(request)
    text = chat_response["text"]
    
    # Generate audio
    if not HF_API_KEY:
        return {
            "text": text,
            "audio": None,
            "error": "TTS not configured"
        }
    
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            # Kokoro TTS API call with Bella voice
            response = await client.post(
                KOKORO_TTS_URL,
                headers={
                    "Authorization": f"Bearer {HF_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "inputs": text,
                    "parameters": {
                        "voice": "af_bella",  # Bella voice
                        "speed": 1.0,
                        "lang": "en-us"
                    }
                }
            )
            response.raise_for_status()
            
            # Convert audio to base64 for embedding
            import base64
            audio_base64 = base64.b64encode(response.content).decode('utf-8')
            
            return {
                "text": text,
                "audio": audio_base64,
                "audio_type": "audio/wav"
            }
            
    except httpx.HTTPError as e:
        return {
            "text": text,
            "audio": None,
            "error": f"TTS error: {str(e)}"
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
