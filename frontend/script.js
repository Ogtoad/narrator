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
            form: document.getElementById('chat-form'),
            bgMusic: document.getElementById('bg-music')
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
            isAudioPlaying: false,
            bgMusicStarted: false
        };

        this.init();
    }

    init() {
         if (!this.validateElements()) return;
         this.initializeEventListeners();
         this.elements.faceImage.classList.add('idle');
         this.elements.messageInput.focus();
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

        // Start background music on first user interaction with the input
        const startBgMusic = () => {
            if (!this.elements.bgMusic || this.state.bgMusicStarted) return;
            this.state.bgMusicStarted = true;
            this.elements.bgMusic.volume = 0.4;
            const playPromise = this.elements.bgMusic.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {
                    // If playback fails, allow retries on next interaction
                    this.state.bgMusicStarted = false;
                });
            }
        };

        // Handle potential audio errors
        this.elements.audioPlayer.addEventListener('error', (e) => {
            // Ignore errors when src is empty (e.g. during cleanup)
            if (!this.elements.audioPlayer.src || this.elements.audioPlayer.src === window.location.href) return;
            console.error('Audio element error:', e);
            this.showError('Audio playback error occurred.');
        });

        // --- Aggressive input focus management ---
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        // Refocus input whenever it loses focus (unless it's disabled)
        this.elements.messageInput.addEventListener('blur', () => {
            if (!this.elements.messageInput.disabled) {
                // On touch devices, use a longer delay to avoid fighting the virtual keyboard
                const delay = isTouchDevice ? 150 : 0;
                setTimeout(() => {
                    if (!this.elements.messageInput.disabled) {
                        this.elements.messageInput.focus({ preventScroll: true });
                    }
                }, delay);
            }
        });

        this.elements.messageInput.addEventListener('focus', startBgMusic, { once: true });
        this.elements.messageInput.addEventListener('click', startBgMusic, { once: true });

        // Capture any keydown on the document and redirect to input
        document.addEventListener('keydown', (e) => {
            const input = this.elements.messageInput;
            // Skip if input is disabled or if it's a modifier-only key
            if (input.disabled) return;
            // Don't intercept browser shortcuts (Ctrl/Cmd + key, except common typing combos)
            if ((e.ctrlKey || e.metaKey) && !['a', 'c', 'v', 'x', 'z'].includes(e.key.toLowerCase())) return;

            if (document.activeElement !== input) {
                input.focus();
                // For printable characters, the focus will capture the keystroke naturally
            }
        });

        // Refocus after any click/tap anywhere on the page
        document.addEventListener('click', () => {
            if (!this.elements.messageInput.disabled) {
                this.elements.messageInput.focus({ preventScroll: true });
            }
        });

        // Refocus when tab becomes visible again
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && !this.elements.messageInput.disabled) {
                this.elements.messageInput.focus({ preventScroll: true });
            }
        });

        // Refocus after touch events (mobile) — slightly delayed to let touch events settle
        document.addEventListener('touchend', () => {
            if (!this.elements.messageInput.disabled) {
                setTimeout(() => {
                    this.elements.messageInput.focus({ preventScroll: true });
                }, 100);
            }
        });

        // On mobile, refocus when the virtual keyboard is dismissed (resize event)
        if (isTouchDevice) {
            window.addEventListener('resize', () => {
                if (!this.elements.messageInput.disabled) {
                    setTimeout(() => {
                        this.elements.messageInput.focus({ preventScroll: true });
                    }, 100);
                }
            });
        }
    }

    async handleSubmit() {
        const message = this.elements.messageInput.value.trim();
        if (!message || this.state.requestInFlight) return;

        // Remove placeholder after first submission
        this.elements.messageInput.placeholder = '';

        // Fire the letter-dissolve animation before clearing the input
        this.animateInputToFace(message);

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
            // Re-focus input as soon as it's re-enabled
            this.elements.messageInput.focus();
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

        // Fade out text and face after all segments finish
        this.fadeOutNarration();
    }

    fadeOutNarration() {
        // After a brief pause, dissolve the narration text letter by letter
        setTimeout(() => {
            const container = this.elements.narrationText;
            const wordSpans = container.querySelectorAll('.word');

            // Collect all visible text, then rebuild as individual letter spans
            const letters = [];
            wordSpans.forEach((wordSpan, wordIdx) => {
                const text = wordSpan.textContent;
                for (const char of text) {
                    const span = document.createElement('span');
                    span.className = 'fade-letter';
                    span.textContent = char;
                    letters.push(span);
                }
                // Add a space between words (except after the last word)
                if (wordIdx < wordSpans.length - 1) {
                    const space = document.createElement('span');
                    space.className = 'fade-letter';
                    space.textContent = '\u00A0';
                    letters.push(space);
                }
            });

            // If no letters found (e.g. static text without word spans), split the raw text
            if (letters.length === 0) {
                const rawText = container.textContent;
                for (const char of rawText) {
                    const span = document.createElement('span');
                    span.className = 'fade-letter';
                    span.textContent = char === ' ' ? '\u00A0' : char;
                    letters.push(span);
                }
            }

            // Replace container content with letter spans
            container.innerHTML = '';
            const fragment = document.createDocumentFragment();
            letters.forEach(span => fragment.appendChild(span));
            container.appendChild(fragment);

            // Shuffle indices for random fade-out order
            const indices = letters.map((_, i) => i);
            for (let j = indices.length - 1; j > 0; j--) {
                const k = Math.floor(Math.random() * (j + 1));
                [indices[j], indices[k]] = [indices[k], indices[j]];
            }

            const totalDuration = 1.2; // seconds for the full animation per letter
            const maxStagger = Math.min(1.5, letters.length * 0.03); // spread across letters

            // Assign staggered delays based on shuffled order
            const delayMap = new Array(letters.length);
            indices.forEach((originalIndex, rank) => {
                delayMap[originalIndex] = (rank / Math.max(letters.length - 1, 1)) * maxStagger;
            });

            letters.forEach((span, i) => {
                span.style.animationDelay = `${delayMap[i]}s`;
                span.style.animationDuration = `${totalDuration}s`;
                span.classList.add('fade-letter-out');
            });

            // Clean up after all animations complete
            const cleanupTime = (totalDuration + maxStagger + 0.2) * 1000;
            setTimeout(() => {
                container.classList.remove('active');
                container.innerHTML = '';
                this.elements.faceImage.classList.add('idle');
                this.elements.faceImage.classList.remove('playing');
            }, cleanupTime);
        }, 2000);
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

    /**
     * Animates the submitted input text: each letter shrinks, fades, and
     * flies toward the face image position.
     */
    animateInputToFace(text) {
        const inputRect = this.elements.messageInput.getBoundingClientRect();
        const faceRect = this.elements.faceImage.getBoundingClientRect();

        // Target center of the face image
        const targetX = faceRect.left + faceRect.width / 2;
        const targetY = faceRect.top + faceRect.height / 2;

        // Source center of the input field
        const sourceX = inputRect.left + inputRect.width / 2;
        const sourceY = inputRect.top + inputRect.height / 2;

        // Create overlay positioned exactly where the input text is
        const overlay = document.createElement('div');
        overlay.className = 'input-animation-overlay';
        overlay.style.left = `${inputRect.left}px`;
        overlay.style.top = `${inputRect.top}px`;
        overlay.style.width = `${inputRect.width}px`;
        overlay.style.height = `${inputRect.height}px`;
        overlay.style.alignItems = 'center';
        overlay.style.fontSize = getComputedStyle(this.elements.messageInput).fontSize;
        overlay.style.fontFamily = getComputedStyle(this.elements.messageInput).fontFamily;

        // Per-letter dx/dy from the overlay center to the face center
        const dx = targetX - sourceX;
        const dy = targetY - sourceY;

        const totalDuration = 1.4; // seconds per letter animation
        const maxStagger = 0.8;    // max total stagger spread across all letters
        const letters = text.split('');

        // Generate pseudo-random delays using a seeded shuffle approach
        // so letters disappear in a seemingly random order
        const indices = letters.map((_, i) => i);
        for (let j = indices.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [indices[j], indices[k]] = [indices[k], indices[j]];
        }
        // Map shuffled position to delay: the letter at shuffled rank 0 goes first, etc.
        const delayMap = new Array(letters.length);
        indices.forEach((originalIndex, rank) => {
            delayMap[originalIndex] = (rank / Math.max(letters.length - 1, 1)) * maxStagger;
        });

        letters.forEach((char, i) => {
            const span = document.createElement('span');
            span.className = 'anim-letter';
            span.textContent = char === ' ' ? '\u00A0' : char;

            span.style.setProperty('--letter-delay', `${delayMap[i]}s`);
            span.style.setProperty('--anim-duration', `${totalDuration}s`);
            span.style.setProperty('--dx', `${dx}px`);
            span.style.setProperty('--dy', `${dy}px`);

            overlay.appendChild(span);
        });

        document.body.appendChild(overlay);

        // Remove overlay after all animations complete
        const cleanupTime = (totalDuration + maxStagger + 0.1) * 1000;
        setTimeout(() => overlay.remove(), cleanupTime);
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
