import { Component, OnDestroy, OnInit, inject, ViewChild, ElementRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SpeechService } from './services/speech.service';
import { ConversationService } from './services/conversation.service';
import { AudioService } from './services/audio.service';
import { SystemStatus } from './models/amvi.models';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  speechService = inject(SpeechService);
  conversationService = inject(ConversationService);
  audioService = inject(AudioService);

  isListening = true;
  volumeLevel = 80;
  isFormCollapsed = true;
  private subscriptions: Subscription = new Subscription();

  @ViewChild('transcriptScrollContainer') private transcriptScrollContainer!: ElementRef;

  systemStatuses: SystemStatus[] = [
    { name: 'Microphone', icon: 'bi-mic', status: 'Active', isActive: true },
    { name: 'Speech Recognition', icon: 'bi-translate', status: 'Active', isActive: true },
    { name: 'Intent Engine', icon: 'bi-cpu', status: 'Active', isActive: true },
    { name: 'Network', icon: 'bi-wifi', status: 'Connected', isActive: true },
    { name: 'Backend API', icon: 'bi-server', status: 'Ready', isActive: true }
  ];

  // Expose signals to template
  formFields = this.conversationService.formFields;
  transcriptMessages = this.conversationService.transcriptMessages;
  aiSummary = this.conversationService.aiSummary;
  completedFields = this.conversationService.completedFields;
  totalFields = this.conversationService.totalFields;
  progressPercentage = this.conversationService.progressPercentage;
  isWorkflowComplete = this.conversationService.isWorkflowComplete;

  constructor() {
    // Auto-scroll effect when transcript messages change
    effect(() => {
      const messages = this.transcriptMessages();
      setTimeout(() => this.scrollToBottom(), 50);
    });
  }

  ngOnInit() {
    this.audioService.setVolume(this.volumeLevel);
    
    // Auto-start listening on load for immersive experience
    this.startListening();
    
    this.subscriptions.add(
      this.speechService.isListening$.subscribe(isListening => {
        this.isListening = isListening;
        
        // Update statuses based on listening state
        const micStatus = this.systemStatuses.find(s => s.name === 'Microphone');
        const speechStatus = this.systemStatuses.find(s => s.name === 'Speech Recognition');
        if (micStatus) {
            micStatus.isActive = isListening;
            micStatus.status = isListening ? 'Active' : 'Inactive';
        }
        if (speechStatus) {
            speechStatus.isActive = isListening;
            speechStatus.status = isListening ? 'Active' : 'Inactive';
        }
      })
    );

    this.subscriptions.add(
      this.speechService.recognizedText$.subscribe(text => {
        if (text && text.trim()) {
           this.audioService.playSuccessBeep();
           this.conversationService.addUserMessage(text);
        }
      })
    );
    
    this.subscriptions.add(
      this.speechService.interimText$.subscribe(text => {
        if (text === '') {
           this.conversationService.clearInterimMessage();
        } else if (text && text.trim()) {
           this.conversationService.addInterimMessage(text);
        }
      })
    );

    this.subscriptions.add(
      this.speechService.error$.subscribe(error => {
        this.audioService.playErrorBeep();
        console.error('Speech API Error:', error);
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    this.speechService.stopRecognition();
  }

  private scrollToBottom(): void {
    try {
      if (this.transcriptScrollContainer) {
        this.transcriptScrollContainer.nativeElement.scrollTop = this.transcriptScrollContainer.nativeElement.scrollHeight;
      }
    } catch(err) { }
  }

  async startListening() {
    this.audioService.playStartSound();
    await this.speechService.startRecognition();
  }

  async stopListening() {
    this.audioService.playStopSound();
    await this.speechService.stopRecognition();
  }

  async toggleListening() {
    if (this.isListening) {
      await this.stopListening();
    } else {
      await this.startListening();
    }
  }

  toggleForm() {
    this.isFormCollapsed = !this.isFormCollapsed;
  }

  pauseListening() {
    this.toggleListening();
  }

  clearTranscript() {
    this.conversationService.clearTranscript();
  }

  clearForm() {
    this.conversationService.clearForm();
  }

  submitForm() {
    this.conversationService.submitForm();
  }

  testSound() {
    this.audioService.setVolume(this.volumeLevel);
    this.audioService.playSuccessBeep();
  }

  onVolumeChange() {
      this.audioService.setVolume(this.volumeLevel);
  }

  repeatLastPrompt() {
    this.conversationService.repeatQuestion();
  }

  skipAndProceed() {
    this.conversationService.skipQuestion();
  }
}
