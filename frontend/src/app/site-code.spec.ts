import { TestBed } from '@angular/core/testing';
import { ValidationService } from './services/validation.service';
import { ConversationalCommandService } from './services/conversational-command.service';
import { FormField } from './models/amvi.models';

describe('Site Code Validation and Intent Extraction', () => {
  let validationService: ValidationService;
  let conversationalCommandService: ConversationalCommandService;

  const mockFields: FormField[] = [
    { id: 'siteCode', label: 'Site Code', value: '', icon: 'hash', hasDropdown: false },
    { id: 'name', label: 'Name', value: '', icon: 'person', hasDropdown: false },
    { id: 'ageRange', label: 'Age Range', value: '', icon: 'calendar', hasDropdown: false },
    { id: 'experience', label: 'Experience', value: '', icon: 'briefcase', hasDropdown: false }
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ValidationService,
        ConversationalCommandService
      ]
    });

    validationService = TestBed.inject(ValidationService);
    conversationalCommandService = TestBed.inject(ConversationalCommandService);
  });

  describe('ValidationService - siteCode', () => {
    it('should validate 1 digit site code', () => {
      const result = validationService.validate('siteCode', '1');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('1');
    });

    it('should validate 2 digit site code', () => {
      const result = validationService.validate('siteCode', '10');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('10');
    });

    it('should validate 3 digit site code', () => {
      const result = validationService.validate('siteCode', '104');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('104');
    });

    it('should validate 4 digit site code', () => {
      const result = validationService.validate('siteCode', '2004');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('2004');
    });

    it('should validate longer digit site code', () => {
      const result = validationService.validate('siteCode', '99999');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('99999');
    });

    it('should reject non-numeric site codes', () => {
      const invalidValues = ['abc', '12a', '', '   '];
      for (const val of invalidValues) {
        const result = validationService.validate('siteCode', val);
        expect(result.valid).toBe(false);
      }
    });
  });

  describe('ConversationalCommandService - Site Code Semantic Intent Extraction', () => {
    it('should extract site code intent for explicit commands', () => {
      const intents = conversationalCommandService.extractIntentsSemantically(
        'site code is 10',
        null,
        mockFields
      );
      const siteCodeIntent = intents.find(i => i.field === 'siteCode');
      expect(siteCodeIntent).toBeDefined();
      expect(siteCodeIntent?.value).toBe('10');
    });

    it('should extract 1 digit site code', () => {
      const intents = conversationalCommandService.extractIntentsSemantically(
        'site code is 5',
        null,
        mockFields
      );
      const siteCodeIntent = intents.find(i => i.field === 'siteCode');
      expect(siteCodeIntent).toBeDefined();
      expect(siteCodeIntent?.value).toBe('5');
    });

    it('should extract numeric values when siteCode is active', () => {
      const intents = conversationalCommandService.extractIntentsSemantically(
        '55',
        'siteCode',
        mockFields
      );
      const siteCodeIntent = intents.find(i => i.field === 'siteCode');
      expect(siteCodeIntent).toBeDefined();
      expect(siteCodeIntent?.value).toBe('55');
    });
  });

  describe('ConversationalCommandService - Pronoun Resolution', () => {
    it('should resolve pronouns to siteCode when siteCode is active and value is a number', () => {
      const command = conversationalCommandService.parseCommand(
        'change that to 10',
        'change that to 10',
        'siteCode',
        mockFields,
        null
      );
      expect(command.isCommand).toBe(true);
      expect(command.type).toBe('correction');
      expect(command.fieldId).toBe('siteCode');
      expect(command.value).toBe('10');
    });

    it('should resolve pronouns to siteCode when experience is not active and value is numeric', () => {
      const command = conversationalCommandService.parseCommand(
        'no make it 5',
        'no make it 5',
        'name',
        mockFields,
        null
      );
      expect(command.isCommand).toBe(true);
      expect(command.type).toBe('correction');
      expect(command.fieldId).toBe('siteCode');
      expect(command.value).toBe('5');
    });

    it('should resolve pronouns to experience when experience is active and value is numeric', () => {
      const command = conversationalCommandService.parseCommand(
        'change that to 10',
        'change that to 10',
        'experience',
        mockFields,
        null
      );
      expect(command.isCommand).toBe(true);
      expect(command.type).toBe('correction');
      expect(command.fieldId).toBe('experience');
      expect(command.value).toBe('10 Years');
    });
  });
});
