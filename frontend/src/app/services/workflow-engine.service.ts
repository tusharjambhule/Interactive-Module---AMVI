import { Injectable } from '@angular/core';
import { FormField } from '../models/amvi.models';

@Injectable({
  providedIn: 'root'
})
export class WorkflowEngineService {
  
  determineNextField(fields: FormField[]): FormField | undefined {
    return fields.find(f => !f.value);
  }

  getPromptForField(fieldId: string): string {
    switch (fieldId) {
      case 'siteCode': return 'What is the Site Code?';
      case 'name': return 'What is your name?';
      case 'ageRange': return 'What is your age range?';
      case 'experience': return 'How many years of experience do you have?';
      case 'role': return 'Are you the Site Manager?';
      case 'notes': return 'Any additional audio notes for this site?';
      default: return 'Please provide more information.';
    }
  }

  getRetryPrompt(fieldId: string): string {
    switch (fieldId) {
      case 'siteCode': return 'Could you repeat the Site Code? It should be a number.';
      case 'name': return 'I missed that. What is your name?';
      case 'ageRange': return 'Could you repeat your age range?';
      case 'experience': return 'Please tell me your experience in years.';
      case 'role': return 'Could you clarify if you are the Site Manager?';
      case 'notes': return 'Do you have any additional notes to report?';
      default: return 'Could you repeat that?';
    }
  }

  isCorrection(text: string): boolean {
    const correctionKeywords = ['no i meant', 'sorry i mean', 'actually it is', 'wait it is', 'i meant', 'correction', 'change that to'];
    return correctionKeywords.some(kw => text.includes(kw));
  }

  isSemanticCompletion(text: string): boolean {
    const completions = ['thats it', 'done', 'nothing else', 'all good', 'finished', 'submit', 'ready to submit', 'we are done', 'im finished'];
    return completions.some(c => text === c || text.includes(c));
  }
  
  isPositiveConfirmation(text: string): boolean {
    const exactMatches = ['s', 'yas', 'yea', 'yep', 'yup', 'yes'];
    const containsMatches = ['correct', 'okay', 'proceed', 'submit', 'i am', 'sure', 'yeah', 'absolutely'];
    
    const lowerText = text.toLowerCase().trim();
    
    if (exactMatches.includes(lowerText)) return true;
    return containsMatches.some(p => lowerText.includes(p));
  }

  isNegativeConfirmation(text: string): boolean {
    const exactMatches = ['n', 'na', 'nah', 'no'];
    const containsMatches = ['wait', 'change it', 'edit', 'not', 'nope', 'incorrect'];
    
    const lowerText = text.toLowerCase().trim();
    
    if (exactMatches.includes(lowerText)) return true;
    return containsMatches.some(n => lowerText.includes(n));
  }
}
