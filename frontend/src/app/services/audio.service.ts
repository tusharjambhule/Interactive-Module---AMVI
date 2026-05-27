import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private audioContext: AudioContext | null = null;
  private volumeLevel = 0.8;

  constructor() {
    this.initAudioContext();
  }

  private initAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn('AudioContext not supported', e);
    }
  }

  setVolume(level: number) {
    this.volumeLevel = Math.max(0, Math.min(1, level / 100));
  }

  getVolume(): number {
    return this.volumeLevel * 100;
  }

  private playTone(frequency: number, type: OscillatorType, durationMs: number) {
    if (!this.audioContext) return;
    
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);

    gainNode.gain.setValueAtTime(this.volumeLevel, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + durationMs / 1000);

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + durationMs / 1000);
  }

  playStartSound() {
    this.playTone(600, 'sine', 150);
    setTimeout(() => this.playTone(800, 'sine', 200), 100);
  }

  playStopSound() {
    this.playTone(800, 'sine', 150);
    setTimeout(() => this.playTone(600, 'sine', 200), 100);
  }

  playSuccessBeep() {
    this.playTone(1000, 'sine', 300);
  }

  playErrorBeep() {
    this.playTone(300, 'sawtooth', 300);
    setTimeout(() => this.playTone(300, 'sawtooth', 400), 150);
  }

  playInvalidInputSound() {
    this.playTone(200, 'square', 200);
  }

  playCorrectionSound() {
    this.playTone(600, 'triangle', 150);
    setTimeout(() => this.playTone(900, 'triangle', 200), 100);
  }
}
