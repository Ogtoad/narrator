// Audio-text synchronization for narrator
class NarratorSync {
    constructor() {
        this.audioPlayer = document.getElementById('audio-player');
        this.narrationText = document.getElementById('narration-text');
        this.messageInput = document.getElementById('message-input');
        this.loading = document.getElementById('loading');
        this.currentText = '';
        this.words = [];
        this.wordTimings = [];
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const form = document.getElementById('chat-form');
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleSubmit();
        });

        // Audio playback events
        this.audioPlayer.addEventListener('play', () => {
            this.startWordSync();
        });

        this.audioPlayer.addEventListener('ended', () => {
            this.onAudioEnd();
        });
    }

    async handleSubmit() {
        const message = this.messageInput.value.trim();
        if (!message) return;

        // Show loading
        this.showLoading();
        this.clearNarration();
        this.messageInput.value = '';
        this.messageInput.disabled = true;

        try {
            const response = await fetch('/api/narrate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    model: 'xiaomi/mimo-v2-flash'
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Response not OK:', response.status, errorText);
                throw new Error('Failed to get narration');
            }

            const data = await response.json();
            console.log('Received data:', data);
            console.log('Data keys:', Object.keys(data));
            console.log('Audio field:', data.audio);
            console.log('Error field:', data.error);
            
            this.hideLoading();
            
            // Display text and play audio
            await this.displayNarration(data.text, data.audio, data.audio_type);

        } catch (error) {
            console.error('Error:', error);
            this.hideLoading();
            this.showError('Failed to generate narration. Please try again.');
        } finally {
            this.messageInput.disabled = false;
            this.messageInput.focus();
        }
    }

    async displayNarration(text, audioBase64, audioType) {
        this.currentText = text;
        this.words = text.split(/\s+/);
        
        console.log('Display narration called');
        console.log('Text:', text);
        console.log('Has audio:', !!audioBase64);
        console.log('Audio type:', audioType);

        // Only show text when audio is available and playing
        if (audioBase64) {
            try {
                // Convert base64 to blob
                const audioBlob = this.base64ToBlob(audioBase64, audioType);
                const audioUrl = URL.createObjectURL(audioBlob);
                
                console.log('Audio URL created:', audioUrl);
                
                this.audioPlayer.src = audioUrl;
                
                // Wait for audio to load
                await new Promise((resolve, reject) => {
                    this.audioPlayer.addEventListener('loadedmetadata', () => {
                        console.log('Audio loaded, duration:', this.audioPlayer.duration);
                        this.calculateWordTimings();
                        resolve();
                    }, { once: true });
                    
                    this.audioPlayer.addEventListener('error', (e) => {
                        console.error('Audio load error:', e);
                        reject(e);
                    }, { once: true });
                });
                
                // Now play audio and show text
                await this.audioPlayer.play();
                console.log('Audio playing');
                
            } catch (error) {
                console.error('Audio playback error:', error);
                this.showError('Failed to play audio. Showing text only.');
                // Fallback: show text without audio
                this.narrationText.textContent = text;
                this.narrationText.classList.add('active');
            }
        } else {
            console.error('No audio data received');
            this.showError('No audio generated. Check TTS configuration.');
        }
    }

    base64ToBlob(base64, mimeType) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    }

    calculateWordTimings() {
        const duration = this.audioPlayer.duration;
        const wordCount = this.words.length;
        const timePerWord = duration / wordCount;

        this.wordTimings = this.words.map((word, index) => ({
            word: word,
            startTime: index * timePerWord,
            endTime: (index + 1) * timePerWord
        }));
    }

    startWordSync() {
        if (this.wordTimings.length === 0) return;

        // Create word-by-word display
        this.narrationText.innerHTML = '';
        
        this.words.forEach((word, index) => {
            const wordSpan = document.createElement('span');
            wordSpan.className = 'word';
            wordSpan.textContent = word;
            wordSpan.style.animationDelay = `${this.wordTimings[index].startTime}s`;
            
            this.narrationText.appendChild(wordSpan);
            
            // Add space after word (except last word)
            if (index < this.words.length - 1) {
                this.narrationText.appendChild(document.createTextNode(' '));
            }
        });

        this.narrationText.classList.add('active');
    }

    onAudioEnd() {
        // Keep text displayed after audio ends
        console.log('Audio playback completed');
    }

    clearNarration() {
        this.narrationText.textContent = '';
        this.narrationText.classList.remove('active');
        this.audioPlayer.pause();
        this.audioPlayer.src = '';
        this.words = [];
        this.wordTimings = [];
    }

    showLoading() {
        this.loading.classList.remove('hidden');
    }

    hideLoading() {
        this.loading.classList.add('hidden');
    }

    showError(message) {
        this.narrationText.textContent = message;
        this.narrationText.classList.add('active');
        this.narrationText.style.color = '#ff6b6b';
        
        setTimeout(() => {
            this.narrationText.style.color = '#ffffff';
            this.clearNarration();
        }, 3000);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new NarratorSync();
});
