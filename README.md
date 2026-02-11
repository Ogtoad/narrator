# Narrator

An AI-powered voice narrator with hand-drawn artwork. Type a message, and a dramatic narrator voice responds — text synchronized word-by-word with generated speech, framed by illustrated stone pillars and a portrait.

## Overview

Narrator pairs LLM text generation (via OpenRouter) with Kokoro TTS voice synthesis to produce narrated responses in real time. The interface is built around original artwork: a central portrait that reacts to speech state, flanked by illustrated pillars surrounding the input field.

The text rendering is synchronized to audio playback at the word level, creating a subtitle-like reading experience.

## Architecture

```
narrator/
├── backend/
│   └── main.py              # FastAPI server, LLM + TTS pipeline
├── frontend/
│   ├── index.html            # Page structure
│   ├── style.css             # Layout and animation
│   ├── script.js             # Audio-text sync engine
│   └── assets/               # Artwork (portrait, pillars)
├── .env                      # API keys (not tracked)
├── .env.example              # Configuration reference
├── requirements.txt          # Python dependencies
├── run.sh                    # Linux/macOS launcher
└── run.bat                   # Windows launcher
```

## Pipeline

1. User submits a message via the input field
2. Backend sends the message to an LLM through OpenRouter with a narrator system prompt
3. The generated text is split into sentence batches (max 200 chars each)
4. Each batch is sent to Kokoro TTS in parallel for voice synthesis
5. Audio segments (base64-encoded WAV) and their text are returned to the frontend
6. The frontend plays each segment sequentially, highlighting words in sync with playback

## Setup

### Requirements

- Python 3.8+
- [OpenRouter API key](https://openrouter.ai/)

### Install

```bash
git clone https://github.com/Ogtoad/narrator.git
cd narrator
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` with your API key:

```env
OPENROUTER_API_KEY=your_key_here
```

### Run

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000`.

## Configuration

All configuration is in `.env`:

| Variable | Default | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | (required) | API key for text generation |
| `DEFAULT_MODEL` | `nvidia/nemotron-3-nano-30b-a3b:free` | LLM model via OpenRouter |
| `KOKORO_TTS_SPACE` | `T0adOG/Kokoro-TTS-cpu` | HuggingFace Gradio space for TTS |
| `KOKORO_VOICE` | `af_nicole` | Kokoro voice preset |

## API

### `POST /api/narrate`

Generates narrated audio from a message or pre-written text.

**Request:**
```json
{ "message": "Tell me about the void" }
```
or
```json
{ "text": "The void stares back." }
```

**Response:**
```json
{
  "segments": [
    {
      "text": "The void stares back.",
      "audio": "<base64 WAV>",
      "audio_type": "audio/wav"
    }
  ]
}
```

## License

MIT
