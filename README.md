# Narrator - AI Voice Chat

A minimalist AI-powered narrator application that combines text generation with text-to-speech, creating an immersive subtitle-style experience with synchronized audio narration.

## Features

- 🎙️ **AI Text Generation**: Uses OpenRouter API for intelligent, narrator-style responses
- 🔊 **Text-to-Speech**: Integrates Kokoro TTS via HuggingFace for natural voice synthesis
- 🎬 **Synchronized Display**: Text appears in sync with audio playback
- 🎨 **Minimalist Design**: Clean black background with centered text display
- ⚡ **Real-time Processing**: FastAPI backend with HTMX frontend for smooth interactions

## Tech Stack

### Backend
- **FastAPI**: Modern Python web framework
- **OpenRouter API**: AI text generation
- **Kokoro TTS**: High-quality text-to-speech via HuggingFace
- **httpx**: Async HTTP client

### Frontend
- **HTMX**: Dynamic HTML without complex JavaScript frameworks
- **Vanilla JavaScript**: Audio-text synchronization
- **CSS3**: Minimalist, responsive design

## Project Structure

```
narrator/
├── backend/
│   └── main.py           # FastAPI application
├── frontend/
│   ├── index.html        # Main HTML page
│   ├── style.css         # Styling
│   └── script.js         # Audio-text sync logic
├── .env                  # Environment variables (not in git)
├── .env.example          # Example environment variables
├── .gitignore           # Git ignore rules
├── requirements.txt      # Python dependencies
└── README.md            # This file
```

## Setup Instructions

### Prerequisites

- Python 3.8+
- You'll need an access key to Huggingface to make api calls. I asume.
- OpenRouter API key ([Get one here](https://openrouter.ai/))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Ogtoad/narrator.git
   cd narrator
   ```

2. **Create a virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables**
    ```bash
    cp .env.example .env
    ```
    
    Edit [`.env`](.env:1) and add your API keys:
    ```env
    OPENROUTER_API_KEY=your_openrouter_api_key_here
    KOKORO_TTS_SPACE=T0adOG/Kokoro-TTS-cpu
    KOKORO_VOICE=af_nicole
    ```

### Running the Application

1. **Start the FastAPI server**
   ```bash
   python backend/main.py
   ```
   
   Or using uvicorn directly:
   ```bash
   uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **Open your browser**
   Navigate to: `http://localhost:8000`

## Usage

1. Type your message in the input box at the bottom of the screen
2.  hit Enter
3. Watch as the AI generates a narrator-style response
4. The text appears in the center of the screen
5. Audio narration plays automatically, synchronized with the text display

## API Endpoints

### `GET /`
Serves the main HTML page

### `POST /api/chat`
Generate AI text response only
- **Request Body**: `{ "message": "string", "model": "string" }`
- **Response**: `{ "text": "string" }`

### `POST /api/tts`
Convert text to speech
- **Request Body**: `text` (form parameter)
- **Response**: Audio file (WAV format)

### `POST /api/narrate`
Combined endpoint - generates text and audio
- **Request Body**: `{ "message": "string", "model": "string" }`
- **Response**: `{ "text": "string", "audio": "base64_string", "audio_type": "audio/wav" }`

## Customization

### Styling
Edit [`frontend/style.css`](frontend/style.css:1) to customize:
- Background color
- Text size and font
- Separator line appearance
- Input box styling
- Animations

### AI Model
Change the AI model in [`frontend/script.js`](frontend/script.js:1) by modifying the model parameter:
```javascript
model: 'anthropic/claude-3.5-sonnet'  // Change to any OpenRouter supported model
```

### TTS Voice
Modify the Kokoro TTS settings in [`.env`](.env:1) or use a different TTS service by updating [`backend/main.py`](backend/main.py:1)

## Development

### Running in Development Mode
```bash
uvicorn backend.main:app --reload
```

### Testing API Endpoints
Use curl or tools like Postman:
```bash
# Test chat endpoint
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell me a story"}'
```

## Troubleshooting

### Audio Not Playing
- Ensure the Kokoro TTS Gradio space is accessible
- Check browser console for errors

### Text Generation Fails
- Verify OpenRouter API key is correct
- Check API quota/credits
- Review backend logs for error messages

### Synchronization Issues
- Audio duration affects word timing
- Longer texts may need timing adjustments in [`frontend/script.js`](frontend/script.js:1)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is open source and available under the MIT License.

## Acknowledgments

- [OpenRouter](https://openrouter.ai/) for AI text generation API
- [Kokoro TTS](https://huggingface.co/hexgrad/Kokoro-82M) for text-to-speech
- [FastAPI](https://fastapi.tiangolo.com/) for the backend framework
- [HTMX](https://htmx.org/) for dynamic frontend interactions

## Support

For issues, questions, or contributions, please open an issue on GitHub.

---

Built with ❤️ for immersive AI narration experiences
