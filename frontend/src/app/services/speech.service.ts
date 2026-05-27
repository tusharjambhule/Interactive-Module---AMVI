import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SpeechService implements OnDestroy {
  private recognizer: sdk.SpeechRecognizer | null = null;
  private isIntentionalStop = false;
  private isStarted = false;

  private isListeningSubject = new BehaviorSubject<boolean>(true);
  public isListening$ = this.isListeningSubject.asObservable();

  private recognizedTextSubject = new Subject<string>();
  public recognizedText$ = this.recognizedTextSubject.asObservable();

  private interimTextSubject = new Subject<string>();
  public interimText$ = this.interimTextSubject.asObservable();

  private errorSubject = new Subject<string>();
  public error$ = this.errorSubject.asObservable();

  private permissionErrorSubject = new Subject<boolean>();
  public permissionError$ = this.permissionErrorSubject.asObservable();

  // STABILIZATION / DEDUPLICATION PROPERTIES
  private lastProcessedFinalText = '';
  private lastProcessedFinalTime = 0;
  private lastInterimText = '';
  private lastSpeechTime = 0;
  private readonly COOLDOWN_MS = 100; // 100-millisecond cooldown after a processed utterance

  // AUTO-RECONNECT PROPERTIES
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private reconnectTimeout: any = null;

  // MULTILINGUAL PROPERTIES
  private defaultLanguage = 'en-US';
  private supportedLanguages = ['en-US', 'es-ES', 'fr-FR', 'de-DE'];
  private enableAutoLanguageDetection = true;

  constructor() {
    if (!this.isSdkSupported()) {
      console.warn('[SpeechService] Azure Speech SDK key/region are not configured or not supported in this environment.');
    }
  }

  private isSdkSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      !!window.navigator &&
      environment.speechKey !== 'YOUR_AZURE_SPEECH_KEY' &&
      !!environment.speechKey &&
      environment.speechRegion !== 'YOUR_AZURE_SPEECH_REGION' &&
      !!environment.speechRegion
    );
  }

  private async checkMicrophonePermission(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.errorSubject.next('Microphone access is not supported in this browser.');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err: any) {
      console.error('[SpeechService] Microphone permission check failed:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.permissionErrorSubject.next(true);
      }
      this.errorSubject.next(`Microphone access error: ${err.message || err}`);
      return false;
    }
  }

  private initRecognizerInternal(): boolean {
    if (this.recognizer) {
      return true;
    }

    if (!this.isSdkSupported()) {
      console.warn('[SpeechService] Azure Speech SDK is not configured. (Key/Region not set)');
      return false;
    }

    try {
      const speechConfig = sdk.SpeechConfig.fromSubscription(
        environment.speechKey,
        environment.speechRegion
      );

      // Custom silence handling settings (prevent timeout too fast)
      speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "10000");
      
      // Set segmentation silence timeout (1.2 seconds) for low-latency end-of-speech detection
      speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "1200");
      
      // Set recognition mode to INTERACTIVE for conversational/turn-based low-latency streaming
      speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_RecoMode, "INTERACTIVE");

      const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();

      if (this.enableAutoLanguageDetection) {
        // Set Language ID mode to Continuous for real-time multilingual updates
        speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_LanguageIdMode, "Continuous");
        const autoDetectConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(this.supportedLanguages);
        this.recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, autoDetectConfig, audioConfig);
      } else {
        speechConfig.speechRecognitionLanguage = this.defaultLanguage;
        this.recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
      }

      this.setupRecognizerEvents();
      return true;
    } catch (err: any) {
      console.error('[SpeechService] Failed to initialize Azure Speech Recognizer:', err);
      this.errorSubject.next(`Azure initialization error: ${err.message || err}`);
      return false;
    }
  }

  private setupRecognizerEvents() {
    if (!this.recognizer) return;

    this.recognizer.recognizing = (sender, event) => {
      const interimText = event.result.text;
      if (interimText && interimText.trim() !== this.lastInterimText) {
        this.lastInterimText = interimText.trim();
        this.interimTextSubject.next(interimText);
      }
    };

    this.recognizer.recognized = (sender, event) => {
      if (event.result.reason === sdk.ResultReason.RecognizedSpeech) {
        const finalResult = event.result.text;
        if (finalResult && finalResult.trim()) {
          const cleanFinal = finalResult.toLowerCase().trim();
          const lastClean = this.lastProcessedFinalText.toLowerCase().trim();
          const currentTime = Date.now();

          // Immediately clear interim text in the UI
          this.lastInterimText = '';
          this.interimTextSubject.next('');

          // Cooldown check: ignore speech results within COOLDOWN_MS after a final emission
          if (currentTime - this.lastSpeechTime < this.COOLDOWN_MS) {
            console.log('[SpeechService] In cooldown. Ignoring speech result.');
            return;
          }

          // Check for duplicate final transcript within a 2-second window
          if (cleanFinal === lastClean && (currentTime - this.lastProcessedFinalTime) < 2000) {
            console.log('[SpeechService] Suppressed duplicate final transcript:', finalResult);
            return;
          }

          // Set last processed metrics
          this.lastProcessedFinalText = finalResult;
          this.lastProcessedFinalTime = currentTime;
          this.lastSpeechTime = currentTime;

          console.log('[SpeechService] Emitting stable final transcript:', finalResult);
          this.recognizedTextSubject.next(finalResult);
        }
      }
    };

    this.recognizer.canceled = (sender, event) => {
      const cancellation = sdk.CancellationDetails.fromResult((event as any).result || event);
      console.log(`[SpeechService] Canceled: Reason=${cancellation.reason}, ErrorDetails=${cancellation.errorDetails}`);

      // Clear interim text
      this.lastInterimText = '';
      this.interimTextSubject.next('');

      if (cancellation.reason === sdk.CancellationReason.Error) {
        this.errorSubject.next(`Speech error: ${cancellation.errorDetails}`);

        // Don't auto-reconnect on authorization errors (auth failure)
        if (cancellation.ErrorCode === sdk.CancellationErrorCode.AuthenticationFailure) {
          console.error('[SpeechService] Authentication failure. Disabling auto-reconnect.');
          this.isIntentionalStop = true;
        }
      }
    };

    this.recognizer.sessionStarted = (sender, event) => {
      console.log('[SpeechService] Session started.');
      this.reconnectAttempts = 0;
      this.isStarted = true;
      this.isListeningSubject.next(true);
    };

    this.recognizer.sessionStopped = (sender, event) => {
      console.log('[SpeechService] Session stopped.');
      this.isStarted = false;
      this.isListeningSubject.next(false);

      // Clear interim text
      this.lastInterimText = '';
      this.interimTextSubject.next('');

      if (!this.isIntentionalStop) {
        this.handleDisconnect();
      }
    };
  }

  public async startRecognition(): Promise<void> {
    this.isIntentionalStop = false;
    await this.startRecognitionInternal();
  }

  private async startRecognitionInternal(isReconnect = false): Promise<void> {
    if (this.isStarted) {
      this.isListeningSubject.next(true);
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Check permission first
    const hasPermission = await this.checkMicrophonePermission();
    if (!hasPermission) {
      this.isListeningSubject.next(false);
      this.isStarted = false;
      return;
    }

    // Initialize/ensure recognizer exists
    const initialized = this.initRecognizerInternal();
    if (!initialized || !this.recognizer) {
      this.isListeningSubject.next(false);
      this.isStarted = false;
      return;
    }

    try {
      this.recognizer.startContinuousRecognitionAsync(
        () => {
          console.log('[SpeechService] startContinuousRecognitionAsync succeeded.');
        },
        (err) => {
          console.error('[SpeechService] startContinuousRecognitionAsync failed:', err);
          this.errorSubject.next(`Start failed: ${err}`);
          this.isListeningSubject.next(false);
          this.isStarted = false;
          if (!isReconnect) {
            this.handleDisconnect();
          }
        }
      );
    } catch (err: any) {
      console.error('[SpeechService] Error in startContinuousRecognitionAsync:', err);
      this.errorSubject.next(`Start error: ${err.message || err}`);
      this.isListeningSubject.next(false);
      this.isStarted = false;
    }
  }

  private handleDisconnect() {
    if (this.isIntentionalStop) return;

    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error('[SpeechService] Max reconnect attempts reached. Stopping auto-reconnect.');
      this.errorSubject.next('Connection lost. Max reconnect attempts reached.');
      this.isListeningSubject.next(false);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 16000);
    console.log(`[SpeechService] Disconnected. Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`);

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      if (!this.isIntentionalStop) {
        this.startRecognitionInternal(true);
      }
    }, delay);
  }

  public async stopRecognition(): Promise<void> {
    this.isIntentionalStop = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.reconnectAttempts = 0;

    if (this.recognizer) {
      try {
        return new Promise<void>((resolve) => {
          this.recognizer!.stopContinuousRecognitionAsync(
            () => {
              console.log('[SpeechService] stopContinuousRecognitionAsync succeeded.');
              this.closeRecognizer();
              this.isStarted = false;
              this.isListeningSubject.next(false);
              resolve();
            },
            (err) => {
              console.error('[SpeechService] stopContinuousRecognitionAsync failed:', err);
              this.closeRecognizer();
              this.isStarted = false;
              this.isListeningSubject.next(false);
              resolve();
            }
          );
        });
      } catch (err) {
        console.error('[SpeechService] Error stopping recognition:', err);
        this.closeRecognizer();
        this.isStarted = false;
        this.isListeningSubject.next(false);
      }
    }
  }

  private closeRecognizer() {
    if (this.recognizer) {
      try {
        this.recognizer.close();
      } catch (err) {
        console.error('[SpeechService] Error closing recognizer:', err);
      }
      this.recognizer = null;
    }
  }

  public pauseRecognition(): void {
    this.stopRecognition();
  }

  ngOnDestroy() {
    this.isIntentionalStop = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.closeRecognizer();
  }
}
