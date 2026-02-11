/**
 * NarratorSync - Handles audio-text synchronization and API interaction.
 * Improved for stability, security, and performance.
 */
class NarratorSync {
    constructor() {
        this.elements = {
            audioPlayer: document.getElementById('audio-player'),
            narrationText: document.getElementById('narration-text'),
            messageInput: document.getElementById('message-input'),
            faceImage: document.getElementById('face-image-bg'),
            form: document.getElementById('chat-form')
        };

        this.state = {
            currentText: '',
            words: [],
            wordTimings: [],
            syncFrameId: null,
            lastWordIndex: -1,
            requestInFlight: false,
            currentAudioUrl: null,
            abortController: null,
            isAudioPlaying: false
        };
        
        this.init();
    }

    init() {
        if (!this.validateElements()) return;
        this.initializeEventListeners();
    }

    validateElements() {
        for (const [key, el] of Object.entries(this.elements)) {
            if (!el) {
                console.error(`Critical Error: Element ${key} not found in DOM.`);
                return false;
            }
        }
        return true;
    }

    initializeEventListeners() {
        this.elements.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });

        this.elements.audioPlayer.addEventListener('play', () => {
            this.state.isAudioPlaying = true;
            this.updateFaceState();
            this.startWordSync();
        });
        this.elements.audioPlayer.addEventListener('pause', () => {
            this.state.isAudioPlaying = false;
            this.updateFaceState();
            this.stopWordSync();
        });
        this.elements.audioPlayer.addEventListener('ended', () => {
            this.state.isAudioPlaying = false;
            this.updateFaceState();
            this.stopWordSync();
        });
        
        // Handle potential audio errors
        this.elements.audioPlayer.addEventListener('error', (e) => {
            // Ignore errors when src is empty (e.g. during cleanup)
            if (!this.elements.audioPlayer.src || this.elements.audioPlayer.src === window.location.href) return;
            console.error('Audio element error:', e);
            this.showError('Audio playback error occurred.');
        });
    }

    async handleSubmit() {
        const message = this.elements.messageInput.value.trim();
        if (!message || this.state.requestInFlight) return;

        this.setLoadingState(true);
        this.clearNarration();
        
        if (this.state.abortController) this.state.abortController.abort();
        this.state.abortController = new AbortController();

        try {
            // Combined endpoint is faster than two separate calls
            const narrateData = await this.fetchApi('/api/narrate', {
                method: 'POST',
                body: JSON.stringify({ message }),
                signal: this.state.abortController.signal
            });

            this.setLoadingState(false);
            await this.displayNarration(narrateData);

        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error('Process Error:', error);
            this.showError(error.message || 'An unexpected error occurred.');
            this.setLoadingState(false);
        } finally {
            this.state.requestInFlight = false;
            this.elements.messageInput.disabled = false;
            this.elements.messageInput.focus();
        }
    }

    async fetchApi(endpoint, options = {}) {
        const response = await fetch(endpoint, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(errorData.detail || `Server error: ${response.status}`);
        }

        return response.json();
    }

    setLoadingState(isLoading) {
        this.state.requestInFlight = isLoading;
        this.elements.messageInput.disabled = isLoading;
        if (isLoading) {
            this.elements.faceImage.classList.add('loading');
            this.elements.faceImage.classList.remove('playing', 'idle');
            this.elements.messageInput.value = '';
        } else {
            this.elements.faceImage.classList.remove('loading');
            this.updateFaceState();
        }
    }

    updateFaceState() {
        if (!this.elements.faceImage) return;
        
        if (this.state.isAudioPlaying) {
            this.elements.faceImage.classList.add('playing');
            this.elements.faceImage.classList.remove('idle');
        } else {
            this.elements.faceImage.classList.add('idle');
            this.elements.faceImage.classList.remove('playing');
        }
    }

    async displayNarration(data) {
        const segments = data.segments || [];
        if (!segments.length) {
            this.showError('No narration segments received.');
            return;
        }

        for (const segment of segments) {
            if (this.state.abortController?.signal.aborted) break;
            await this.playSegment(segment);
        }
    }

    async playSegment(segment) {
        if (segment.error) {
            console.warn('Segment error:', segment.error);
            this.renderStaticText(segment.text);
            return;
        }

        const { text, audio, audio_type = 'audio/wav' } = segment;
        this.state.currentText = text;
        this.state.words = text.split(/\s+/).filter(w => w.length > 0);
        this.state.lastWordIndex = -1;

        try {
            await this.loadAudio(audio, audio_type);
            this.calculateWordTimings();
            
            await this.elements.audioPlayer.play();
            
            // Wait for segment to finish
            await new Promise((resolve) => {
                const onEnded = () => {
                    this.elements.audioPlayer.removeEventListener('ended', onEnded);
                    resolve();
                };
                this.elements.audioPlayer.addEventListener('ended', onEnded);
            });
        } catch (error) {
            console.error('Segment playback failed:', error);
            this.renderStaticText(text);
        }
    }

    renderStaticText(text) {
        this.elements.narrationText.textContent = text;
        this.elements.narrationText.classList.add('active');
    }

    async loadAudio(base64, mimeType) {
        this.cleanupAudioUrl();

        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        
        const blob = new Blob([bytes], { type: mimeType });
        this.state.currentAudioUrl = URL.createObjectURL(blob);
        this.elements.audioPlayer.src = this.state.currentAudioUrl;

        return new Promise((resolve, reject) => {
            const onCanPlay = () => {
                this.elements.audioPlayer.removeEventListener('canplay', onCanPlay);
                this.elements.audioPlayer.removeEventListener('error', onError);
                resolve();
            };
            const onError = (e) => {
                this.elements.audioPlayer.removeEventListener('canplay', onCanPlay);
                this.elements.audioPlayer.removeEventListener('error', onError);
                reject(e);
            };
            this.elements.audioPlayer.addEventListener('canplay', onCanPlay);
            this.elements.audioPlayer.addEventListener('error', onError);
        });
    }

    cleanupAudioUrl() {
        if (this.state.currentAudioUrl) {
            URL.revokeObjectURL(this.state.currentAudioUrl);
            this.state.currentAudioUrl = null;
        }
    }

    calculateWordTimings() {
        const duration = this.elements.audioPlayer.duration;
        if (!duration || isNaN(duration)) return;

        const wordCount = this.state.words.length;
        const timePerWord = duration / wordCount;

        this.state.wordTimings = this.state.words.map((word, index) => ({
            startTime: index * timePerWord,
            endTime: (index + 1) * timePerWord
        }));
    }

    startWordSync() {
        if (!this.state.wordTimings.length) return;

        this.elements.narrationText.innerHTML = '';
        const fragment = document.createDocumentFragment();

        this.state.words.forEach((word, index) => {
            const span = document.createElement('span');
            span.className = 'word';
            span.dataset.index = index;
            span.textContent = word;
            fragment.appendChild(span);
            fragment.appendChild(document.createTextNode(' '));
        });

        this.elements.narrationText.appendChild(fragment);
        this.elements.narrationText.classList.add('active');
        this.runWordSyncLoop();
    }

    runWordSyncLoop() {
        const step = () => {
            if (this.elements.audioPlayer.paused || this.elements.audioPlayer.ended) return;

            const currentTime = this.elements.audioPlayer.currentTime;
            const wordIndex = this.state.wordTimings.findIndex(t => 
                currentTime >= t.startTime && currentTime < t.endTime
            );

            const finalIndex = wordIndex === -1 && currentTime > 0 ? this.state.words.length - 1 : wordIndex;

            if (finalIndex !== this.state.lastWordIndex && finalIndex >= 0) {
                this.updateWordHighlight(finalIndex);
                this.state.lastWordIndex = finalIndex;
            }

            this.state.syncFrameId = requestAnimationFrame(step);
        };

        this.stopWordSync();
        this.state.syncFrameId = requestAnimationFrame(step);
    }

    updateWordHighlight(index) {
        const words = this.elements.narrationText.querySelectorAll('.word');
        words.forEach((span, i) => {
            if (i === index) {
                span.classList.add('visible', 'current');
            } else if (i < index) {
                span.classList.add('visible');
                span.classList.remove('current');
            } else {
                span.classList.remove('visible', 'current');
            }
        });
    }

    stopWordSync() {
        if (this.state.syncFrameId) {
            cancelAnimationFrame(this.state.syncFrameId);
            this.state.syncFrameId = null;
        }
    }

    clearNarration() {
        this.stopWordSync();
        this.cleanupAudioUrl();
        this.elements.narrationText.textContent = '';
        this.elements.narrationText.classList.remove('active');
        this.elements.narrationText.style.color = '';
        this.elements.audioPlayer.pause();
        this.elements.audioPlayer.removeAttribute('src'); // Better than setting to empty string
        this.elements.audioPlayer.load(); // Force reset
        this.state.words = [];
        this.state.wordTimings = [];
    }

    showError(message) {
        this.renderStaticText(message);
        this.elements.narrationText.style.color = '#ff6b6b';
        setTimeout(() => {
            if (this.elements.narrationText.textContent === message) {
                this.clearNarration();
            }
        }, 5000);
    }
}

document.addEventListener('DOMContentLoaded', () => new NarratorSync());
