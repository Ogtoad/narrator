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
import base64
from gradio_client import Client

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
KOKORO_TTS_SPACE = os.getenv("KOKORO_TTS_SPACE", "T0adOG/Kokoro-TTS-cpu")
KOKORO_VOICE = os.getenv("KOKORO_VOICE", "af_nicole")  # Nicole voice


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
    Convert text to speech using Kokoro TTS via Gradio
    Voice: Nicole (af_nicole)
    """
    try:
        print(f"TTS Request - Text: {text}, Voice: {KOKORO_VOICE}")
        
        # Use Gradio client to call the TTS API
        client = Client(KOKORO_TTS_SPACE)
        result = client.predict(
            text=text,
            voice=KOKORO_VOICE,
            speed=1.0,
            api_name="/predict"
        )
        
        print(f"TTS Result: {result}")
        
        # Result is a filepath, read the audio file
        with open(result, 'rb') as audio_file:
            audio_data = audio_file.read()
        
        # Return audio as streaming response
        return StreamingResponse(
            iter([audio_data]),
            media_type="audio/wav",
            headers={
                "Content-Disposition": "attachment; filename=narration.wav"
            }
        )
            
    except Exception as e:
        print(f"TTS Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"TTS API error: {str(e)}")


@app.post("/api/narrate")
async def narrate(request: ChatRequest):
    """
    Combined endpoint: Generate text and audio
    Returns both text and audio data
    Voice: Nicole (af_nicole)
    """
    print(f"Received narrate request: {request}")
    print(f"Message: {request.message}, Model: {request.model}")
    
    # Get text response
    chat_response = await chat(request)
    text = chat_response["text"]
    print(f"Generated text: {text}")
    
    # Generate audio using Gradio client
    try:
        print(f"TTS Request - Text: {text}, Voice: {KOKORO_VOICE}, Space: {KOKORO_TTS_SPACE}")
        
        # Run Gradio client in executor since it's blocking
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: _generate_tts(text, KOKORO_VOICE, KOKORO_TTS_SPACE)
        )
        
        print(f"TTS Result filepath: {result}")
        
        # Result is a filepath, read the audio file
        with open(result, 'rb') as audio_file:
            audio_data = audio_file.read()
        
        # Convert audio to base64 for embedding
        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
        
        print(f"Audio generated successfully, size: {len(audio_data)} bytes")
        
        response_data = {
            "text": text,
            "audio": audio_base64,
            "audio_type": "audio/wav"
        }
        print(f"Returning response with audio: {len(audio_base64)} chars")
        return response_data
            
    except Exception as e:
        import traceback
        print(f"TTS Error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        return {
            "text": text,
            "audio": None,
            "error": f"TTS error: {str(e)}"
        }


def _generate_tts(text: str, voice: str, space: str) -> str:
    """Helper function to generate TTS using Gradio client"""
    try:
        client = Client(space)
        result = client.predict(
            text=text,
            voice=voice,
            speed=1.0,
            api_name="/predict"
        )
        return result
    except Exception as e:
        print(f"Gradio client error: {str(e)}")
        raise


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
