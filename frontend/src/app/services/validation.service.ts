import { Injectable } from '@angular/core';
import { ValidationResult } from '../models/amvi.models';

@Injectable({
  providedIn: 'root'
})
export class ValidationService {
  validate(field: string, value: string): ValidationResult {
    if (!value || value.trim() === '') {
        return { valid: false, value, errorMessage: 'Value cannot be empty' };
    }

    switch (field) {
      case 'siteCode':
        return /^\d+$/.test(value) ? { valid: true, value } : { valid: false, value, errorMessage: 'Site code must be numeric (e.g. 104)' };
      
      case 'ageRange':
        // Enforce X to Y format where X and Y are numeric values
        if (/^\d+\s+to\s+\d+$/.test(value)) {
          return { valid: true, value };
        }
        return { valid: false, value, errorMessage: 'Age range must be in the format "X to Y" (e.g., 40 to 60)' };
        
      case 'experience':
        return { valid: true, value };
        
      case 'name':
        return value.length >= 2 ? { valid: true, value } : { valid: false, value, errorMessage: 'Name must be at least 2 characters' };
        
      default:
        return { valid: true, value };
    }
  }
}
