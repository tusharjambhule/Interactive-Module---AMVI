import { Injectable, computed, signal, inject } from '@angular/core';
import { FormField, TranscriptMessage, ExtractedIntent } from '../models/amvi.models';
import { SpeechParserService } from './speech-parser.service';
import { ValidationService } from './validation.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { AudioService } from './audio.service';
import { SpeechService } from './speech.service';
import { ConversationalCommandService } from './conversational-command.service';

@Injectable({
    providedIn: 'root'
})
export class ConversationService {
    private parser = inject(SpeechParserService);
    private validator = inject(ValidationService);
    private workflow = inject(WorkflowEngineService);
    private audio = inject(AudioService);
    private speech = inject(SpeechService);
    private commandService = inject(ConversationalCommandService);

    // State using Signals
    transcriptMessages = signal<TranscriptMessage[]>([]);
    formFields = signal<FormField[]>([
        { id: 'siteCode', label: '1. Site Code', value: null, icon: 'bi-geo-alt', hasDropdown: false, isActive: false, isValid: undefined },
        { id: 'name', label: '2. Name', value: null, icon: 'bi-person', hasDropdown: false, isActive: false, isValid: undefined },
        { id: 'ageRange', label: '3. Age Range', value: null, icon: 'bi-calendar3', hasDropdown: true, isActive: false, isValid: undefined },
        { id: 'experience', label: '4. Experience', value: null, icon: 'bi-briefcase', hasDropdown: true, isActive: false, isValid: undefined },
        { id: 'role', label: '5. Role (Site Manager)', value: null, icon: 'bi-person-badge', hasDropdown: true, isActive: false, isValid: undefined },
        { id: 'notes', label: '6. Notes', value: null, icon: 'bi-file-text', hasDropdown: false, isActive: false, isValid: undefined }
    ]);
    aiSummary = signal<string | null>(null);
    isWorkflowComplete = signal<boolean>(false);
    isSubmitted = signal<boolean>(false);
    pendingConfirmation = signal<{field: string, value: string} | null>(null);
    isProcessing = signal<boolean>(false);
  
    private lastActiveFieldId: string | null = null;
    private lastModifiedFieldId: string | null = null;
    private summaryActionIdx = Math.floor(Math.random() * 3);
    private promptTimeoutHandle: any = null;

    completedFields = computed(() => this.formFields().filter(f => f.value !== null && f.isValid).length);
    totalFields = computed(() => this.formFields().length);
    progressPercentage = computed(() => {
        const total = this.totalFields();
        if (total === 0) return 0;
        return Math.round((this.completedFields() / total) * 100);
    });

    constructor() {
        this.startConversation();
    }

    private startConversation() {
        this.addSystemMessage("Welcome. Let's start. Say the Site Code.");
        this.updateActiveField('siteCode');
    }

    private updateActiveField(fieldId: string | null) {
        this.formFields.update(fields => fields.map(f => ({ ...f, isActive: f.id === fieldId })));
        if (fieldId) this.lastActiveFieldId = fieldId;
    }

    private getFieldDisplayName(fieldId: string): string {
        switch (fieldId) {
            case 'siteCode': return 'Site Code';
            case 'name': return 'Name';
            case 'ageRange': return 'Age Range';
            case 'experience': return 'Experience';
            case 'role': return 'Role';
            case 'notes': return 'Notes';
            default: return fieldId;
        }
    }

    private clearPromptTimeout() {
        if (this.promptTimeoutHandle) {
            clearTimeout(this.promptTimeoutHandle);
            this.promptTimeoutHandle = null;
        }
    }

    private schedulePrompt(prompt: string, delay: number) {
        this.clearPromptTimeout();
        this.promptTimeoutHandle = setTimeout(() => {
            this.addSystemMessage(prompt);
            this.promptTimeoutHandle = null;
        }, delay);
    }

    addSystemMessage(text: string) {
        this.transcriptMessages.update(msgs => [...msgs, {
            type: 'system',
            text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        }]);
    }

    addUserMessage(text: string) {
        if (this.isProcessing() || this.promptTimeoutHandle) {
            console.log('[ConversationService] locked. Discarding user message:', text);
            return;
        }

        this.transcriptMessages.update(msgs => {
            // Remove interim message if exists before adding user message
            const filtered = msgs.filter(m => m.type !== 'interim');
            return [...filtered, {
                type: 'user',
                text,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            }];
        });

        this.processUserMessage(text);
    }

    clearInterimMessage() {
        this.transcriptMessages.update(msgs => msgs.filter(m => m.type !== 'interim'));
    }

    addInterimMessage(text: string) {
        // Conversational interruption: clear pending system prompt timeouts when the user starts speaking
        if (text && text.trim()) {
            this.clearPromptTimeout();
        }

        this.transcriptMessages.update(msgs => {
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg && lastMsg.type === 'interim') {
                // Update text in-place to avoid list recreation and visual flickering
                return [
                    ...msgs.slice(0, -1),
                    { ...lastMsg, text }
                ];
            } else {
                const filtered = msgs.filter(m => m.type !== 'interim');
                return [...filtered, {
                    type: 'interim',
                    text,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                }];
            }
        });
    }

    private processUserMessage(rawText: string) {
        this.isProcessing.set(true);
        try {
            const normalizedText = this.parser.normalize(rawText);
            const currentFields = this.formFields();
            const activeField = currentFields.find(f => f.isActive);

            // 1. Prioritize check for global conversational/navigation/edit commands
            const cmd = this.commandService.parseCommand(rawText, normalizedText, activeField?.id || null, currentFields, this.lastModifiedFieldId);
            if (cmd.isCommand) {
                this.executeCommand(cmd, activeField);
                return;
            }

            // Intercept confirmation commands when workflow is complete
            if (this.isWorkflowComplete()) {
                if (this.isConfirmationCommand(normalizedText)) {
                    this.submitForm();
                    return;
                }
            }

            // 2. Semantic Completion Detection
            if (this.workflow.isSemanticCompletion(normalizedText)) {
                this.addSystemMessage("Understood. Finishing up...");
                this.updateActiveField(null);
                this.isWorkflowComplete.set(true);
                this.schedulePrompt('Everything is ready. Should I submit?', 800);
                return;
            }

            if (this.isWorkflowComplete() && normalizedText.length > 0) {
                this.isWorkflowComplete.set(false); // Reactivate workflow dynamically if input detected
            }
        
            // 3. Check pending confirmations
            let intents: ExtractedIntent[] = [];
            const pending = this.pendingConfirmation();
        
            if (pending) {
                if (this.workflow.isPositiveConfirmation(normalizedText)) {
                    intents = [{ field: pending.field, value: pending.value, confidence: 1.0 }];
                    this.pendingConfirmation.set(null);
                } else if (this.workflow.isNegativeConfirmation(normalizedText)) {
                    this.pendingConfirmation.set(null);
                    this.clearPromptTimeout();
                    this.addSystemMessage(`Okay, let's try again. ${this.workflow.getPromptForField(pending.field)}`);
                    return;
                } else {
                    this.pendingConfirmation.set(null);
                    intents = this.commandService.extractIntentsSemantically(normalizedText, activeField?.id || null, currentFields);
                }
            } else {
                intents = this.commandService.extractIntentsSemantically(normalizedText, activeField?.id || null, currentFields);
            }
        
            // Intercept low-confidence intents for disambiguation
            const uncertainIntent = intents.find(i => i.confidence < 0.5);
            if (uncertainIntent && activeField) {
                this.pendingConfirmation.set({ field: uncertainIntent.field, value: uncertainIntent.value });
                this.clearPromptTimeout();
                this.addSystemMessage(`Did you mean ${uncertainIntent.value.replace('-', ' to ')}?`);
                return; // Halt processing and wait for user yes/no
            }

            if (intents.length > 0) {
                let activeFieldUpdated = false;
                let otherFieldsUpdated: string[] = [];
                let anyInvalid = false;
                let invalidMsg = '';

                const updatedFields = currentFields.map(f => {
                    const matchedIntent = intents.find(i => i.field === f.id);
                    if (matchedIntent) {
                        const validation = this.validator.validate(f.id, matchedIntent.value);
                        if (validation.valid) {
                            if (activeField && f.id === activeField.id) {
                                activeFieldUpdated = true;
                            } else {
                                otherFieldsUpdated.push(f.id);
                            }
                            return { ...f, value: validation.value, isValid: true };
                        } else {
                            anyInvalid = true;
                            invalidMsg = validation.errorMessage || 'Invalid format.';
                            return { ...f, value: validation.value, isValid: false };
                        }
                    }
                    return f;
                });

                if (anyInvalid) {
                    this.formFields.set(updatedFields);
                    this.generateSummary();
                    this.audio.playInvalidInputSound();
                    const retryMsg = activeField ? this.workflow.getRetryPrompt(activeField.id) : "I didn't quite get that in the right format. Let's try again.";
                    this.clearPromptTimeout();
                    this.addSystemMessage(`${invalidMsg} ${retryMsg}`);
                    return;
                }

                if (activeFieldUpdated || otherFieldsUpdated.length > 0) {
                    this.formFields.set(updatedFields);
                    this.generateSummary();

                    if (otherFieldsUpdated.length > 0) {
                        this.lastModifiedFieldId = otherFieldsUpdated[otherFieldsUpdated.length - 1];
                        this.audio.playCorrectionSound();
                    } else if (activeField) {
                        this.lastModifiedFieldId = activeField.id;
                    }

                    // Construct a feedback response
                    let feedbackText = '';
                    if (otherFieldsUpdated.length > 0) {
                        const listStr = otherFieldsUpdated.map(id => {
                            const val = updatedFields.find(f => f.id === id)?.value;
                            return `${this.getFieldDisplayName(id)} updated to ${val}`;
                        }).join(' and ');

                        if (activeFieldUpdated) {
                            const activeVal = updatedFields.find(f => f.id === activeField?.id)?.value;
                            feedbackText = `${listStr}. Also, ${this.getFieldDisplayName(activeField?.id || '')} set to ${activeVal}.`;
                        } else {
                            feedbackText = `${listStr}.`;
                        }
                    }

                    if (feedbackText) {
                        // Out-of-turn correction interruption occurred. Keep conversational workflow state
                        const nextEmptyField = this.workflow.determineNextField(updatedFields);
                        if (nextEmptyField) {
                            this.updateActiveField(nextEmptyField.id);
                            const nextPrompt = this.workflow.getPromptForField(nextEmptyField.id);
                            const fullPrompt = `${feedbackText} Now, ${nextPrompt.charAt(0).toLowerCase() + nextPrompt.slice(1)}`;
                            this.schedulePrompt(fullPrompt, 400);
                        } else {
                            this.updateActiveField(null);
                            this.isWorkflowComplete.set(true);
                            const fullPrompt = `${feedbackText} Everything is ready. Should I submit?`;
                            this.schedulePrompt(fullPrompt, 400);
                        }
                    } else {
                        // Standard inline field answer processed
                        this.askNextQuestion();
                    }
                }
            } else if (normalizedText.length > 0) {
                // Smart Retry Intelligence
                this.clearPromptTimeout();
                if (activeField) {
                    this.addSystemMessage(this.workflow.getRetryPrompt(activeField.id));
                } else {
                    this.addSystemMessage("I didn't catch that. Could you repeat?");
                }
            }
        } finally {
            this.isProcessing.set(false);
        }
    }

    private executeCommand(cmd: any, activeField: FormField | undefined) {
        this.clearPromptTimeout();
        if (cmd.type === 'clear') {
            this.clearForm();
            return;
        }

        if (cmd.type === 'repeat') {
            const prompt = activeField ? this.workflow.getPromptForField(activeField.id) : 'Everything is ready. Should I submit?';
            this.addSystemMessage(`Sure, repeating the question. ${prompt}`);
            return;
        }

        if (cmd.type === 'skip') {
            this.skipCurrentField(activeField);
            return;
        }

        if (cmd.type === 'activate_field') {
            const targetField = this.formFields().find(f => f.id === cmd.fieldId);
            if (targetField) {
                this.updateActiveField(targetField.id);
                const displayName = this.getFieldDisplayName(targetField.id);
                const prompt = this.workflow.getPromptForField(targetField.id);
                this.addSystemMessage(`Sure, let's update your ${displayName}. ${prompt}`);
            }
            return;
        }

        if (cmd.type === 'correction' || cmd.type === 'edit_field') {
            const fieldId = cmd.fieldId;
            const value = cmd.value;
            const targetField = this.formFields().find(f => f.id === fieldId);

            if (targetField && value) {
                const validation = this.validator.validate(fieldId, value);
                if (validation.valid) {
                    this.formFields.update(fields => fields.map(f => f.id === fieldId ? { ...f, value: validation.value, isValid: true } : f));
                    this.lastModifiedFieldId = fieldId;
                    this.audio.playCorrectionSound();
                    this.generateSummary();

                    const displayName = this.getFieldDisplayName(fieldId);
                    const activePrompt = activeField ? `Now, ${this.workflow.getPromptForField(activeField.id).toLowerCase()}` : 'Everything is ready. Should I submit?';
                    this.addSystemMessage(`${displayName} updated to ${validation.value}. ${activePrompt}`);
                } else {
                    this.audio.playInvalidInputSound();
                    const activePrompt = activeField ? `Now, ${this.workflow.getPromptForField(activeField.id).toLowerCase()}` : 'Everything is ready. Should I submit?';
                    this.addSystemMessage(`Could not update ${this.getFieldDisplayName(fieldId)}. ${validation.errorMessage}. ${activePrompt}`);
                }
            }
            return;
        }
    }

    private skipCurrentField(activeField: FormField | undefined) {
        this.clearPromptTimeout();
        if (!activeField) {
            this.addSystemMessage('No active question to skip.');
            return;
        }

        // Mark the current active field as skipped
        const updatedFields = this.formFields().map(f => 
            f.id === activeField.id ? { ...f, value: 'Skipped', isValid: true } : f
        );
        this.formFields.set(updatedFields);
        this.generateSummary();

        // Determine next empty field
        const nextEmptyField = this.workflow.determineNextField(updatedFields);
        const displayName = this.getFieldDisplayName(activeField.id);

        if (nextEmptyField) {
            this.updateActiveField(nextEmptyField.id);
            const prompt = this.workflow.getPromptForField(nextEmptyField.id);
            this.addSystemMessage(`Okay, skipping ${displayName}. ${prompt}`);
        } else {
            this.updateActiveField(null);
            this.isWorkflowComplete.set(true);
            this.addSystemMessage(`Okay, skipping ${displayName}. Everything is ready. Should I submit?`);
        }
    }

    askNextQuestion() {
        const fields = this.formFields();
        const nextEmptyField = this.workflow.determineNextField(fields);

        if (nextEmptyField) {
            this.isWorkflowComplete.set(false);
            this.updateActiveField(nextEmptyField.id);
            const prompt = this.workflow.getPromptForField(nextEmptyField.id);
            this.schedulePrompt(prompt, 800);
        } else {
            this.updateActiveField(null);
            this.isWorkflowComplete.set(true);
            this.schedulePrompt('Everything is ready. Should I submit?', 800);
        }
    }

    skipQuestion() {
        const activeField = this.formFields().find(f => f.isActive);
        this.skipCurrentField(activeField);
    }

    repeatQuestion() {
        this.clearPromptTimeout();
        const activeField = this.formFields().find(f => f.isActive);
        const prompt = activeField ? this.workflow.getPromptForField(activeField.id) : 'Everything is ready. Should I submit?';
        this.addSystemMessage(`Sure, repeating the question. ${prompt}`);
    }

    private generateSummary() {
        const fields = this.formFields();
        const code = fields.find(f => f.id === 'siteCode')?.value;
        const name = fields.find(f => f.id === 'name')?.value;
        const age = fields.find(f => f.id === 'ageRange')?.value;
        const exp = fields.find(f => f.id === 'experience')?.value;
        const role = fields.find(f => f.id === 'role')?.value;
        const notes = fields.find(f => f.id === 'notes')?.value;

        const hasCode = code && code !== 'Skipped';
        const hasName = name && name !== 'Skipped';
        const hasAge = age && age !== 'Skipped';
        const hasExp = exp && exp !== 'Skipped';
        const hasRole = role && role !== 'Skipped';
        const hasNotes = notes && notes !== 'Skipped';

        if (!hasCode && !hasName && !hasAge && !hasExp && !hasRole && !hasNotes) {
            this.aiSummary.set(null);
            return;
        }

        const variations = [
            "completed the entry for",
            "submitted information for",
            "provided inspection details for"
        ];
        const action = variations[this.summaryActionIdx];

        let summary = '';
        let identity = "";

        if (hasName) {
            identity = name!;
            if (hasRole) {
                const roleDesc = role === 'Yes' ? 'a Site Manager' : 'Site Personnel';
                if (hasExp) {
                    identity += `, ${roleDesc} with ${exp!.toLowerCase()} of experience,`;
                } else {
                    identity += `, ${roleDesc},`;
                }
            } else if (hasExp) {
                identity += `, a respondent with ${exp!.toLowerCase()} of experience,`;
            }
        } else {
            if (hasRole) {
                const roleDesc = role === 'Yes' ? 'A Site Manager' : 'Site Personnel';
                if (hasExp) {
                    identity = `${roleDesc} with ${exp!.toLowerCase()} of experience`;
                } else {
                    identity = roleDesc;
                }
            } else if (hasExp) {
                identity = `A respondent with ${exp!.toLowerCase()} of experience`;
            } else {
                identity = `A respondent`;
            }
        }

        if (hasCode) {
            summary += `${identity} ${action} Site ${code}. `;
        } else {
            summary += `${identity} began an inspection entry. `;
        }

        summary = summary.charAt(0).toUpperCase() + summary.slice(1);

        if (hasAge) {
            summary += `The reported age range is ${age}. `;
        }

        if (hasNotes) {
            const cleanNotes = notes!.toLowerCase();
            if (cleanNotes === 'no notes' || cleanNotes === 'none' || cleanNotes === 'no additional notes') {
                summary += `No additional notes were provided.`;
            } else {
                let cleanedNotes = notes!;
                if (cleanedNotes.toLowerCase().startsWith('the ')) {
                    cleanedNotes = cleanedNotes.slice(4);
                }
                cleanedNotes = cleanedNotes.charAt(0).toLowerCase() + cleanedNotes.slice(1);
                if (cleanedNotes.endsWith('.')) cleanedNotes = cleanedNotes.slice(0, -1);

                summary += `Additional notes were reported regarding ${cleanedNotes}.`;
            }
        }

        this.aiSummary.set(summary.trim());
    }

    clearTranscript() {
        this.transcriptMessages.set([]);
    }

    clearForm() {
        this.clearPromptTimeout();
        this.formFields.update(fields => fields.map(f => ({ ...f, value: null, isValid: undefined, isActive: false })));
        this.aiSummary.set(null);
        this.isWorkflowComplete.set(false);
        this.isSubmitted.set(false);
        this.summaryActionIdx = Math.floor(Math.random() * 3);
        this.clearTranscript();
        this.startConversation();
        this.speech.startRecognition(); // Maintain/restart listening state naturally
    }

    private isConfirmationCommand(text: string): boolean {
        const normalized = text.toLowerCase().trim();
        const confirmationCommands = [
            'submit',
            'yes',
            'confirm',
            'submit the form',
            'proceed',
            'okay submit',
            'yes submit'
        ];
        if (confirmationCommands.includes(normalized)) {
            return true;
        }
        return this.workflow.isPositiveConfirmation(normalized);
    }

    submitForm() {
        this.clearPromptTimeout();
        const formData = this.formFields().reduce((acc, field) => {
            acc[field.id] = field.value;
            return acc;
        }, {} as any);
        console.log('Submitting form data:', formData);

        this.isSubmitted.set(true);
        this.isWorkflowComplete.set(false);
        this.updateActiveField(null);

        this.addSystemMessage("Form submitted successfully!");
        this.audio.playSuccessBeep();

        // Stop recognizer after successful submission
        this.speech.stopRecognition();

        // Trigger alert asynchronously so it doesn't block state updates and recognition shutdown
        setTimeout(() => {
            alert('Form submitted! Check console for data.');
        }, 100);
    }
}
