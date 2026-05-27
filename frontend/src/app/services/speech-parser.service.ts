import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SpeechParserService {
  normalize(text: string): string {
    let lower = text.toLowerCase().trim();
    
    // Remove filler and hedging words
    lower = lower.replace(/\b(uh|um|like|you know|so|well|i mean|around|probably|actually|basically|literally|just|yeah|yes i am|i am|it is|its)\b/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Normalize text representations of numbers
    const numMap: {[key: string]: string} = {
      'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 
      'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
      'ten': '10', 'thirty': '30', 'forty': '40',
      'to': 'to', 'too': 'to'
    };
    
    for (const [word, digit] of Object.entries(numMap)) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      lower = lower.replace(regex, digit);
    }
    
    // Cleanup spacing and punctuation
    lower = lower.replace(/[.,!?]/g, '');
    lower = lower.replace(/\s{2,}/g, ' ');
    
    // Intelligently handle common misinterpretations for numeric ranges
    // Removed aggressive auto-conversion to allow contextual disambiguation in intent-extractor

    
    return lower;
  }
}
