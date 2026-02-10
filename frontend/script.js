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
                    model: 'anthropic/claude-3.5-sonnet'
                })
            });

            if (!response.ok) {
                throw new Error('Failed to get narration');
            }

            const data = await response.json();
            
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
        
        // Show text immediately
        this.narrationText.textContent = text;
        this.narrationText.classList.add('active');

        // If audio is available, play it with sync
        if (audioBase64) {
            try {
                // Convert base64 to blob
                const audioBlob = this.base64ToBlob(audioBase64, audioType);
                const audioUrl = URL.createObjectURL(audioBlob);
                
                this.audioPlayer.src = audioUrl;
                await this.audioPlayer.play();
                
                // Calculate word timings based on audio duration
                this.audioPlayer.addEventListener('loadedmetadata', () => {
                    this.calculateWordTimings();
                }, { once: true });
                
            } catch (error) {
                console.error('Audio playback error:', error);
                // Text is already displayed, so just continue
            }
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
