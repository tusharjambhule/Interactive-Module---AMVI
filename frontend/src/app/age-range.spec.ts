import { TestBed } from '@angular/core/testing';
import { ValidationService } from './services/validation.service';
import { IntentExtractorService } from './services/intent-extractor.service';
import { ConversationalCommandService } from './services/conversational-command.service';
import { FormField } from './models/amvi.models';

describe('Age Range Extraction and Normalization', () => {
  let validationService: ValidationService;
  let intentExtractorService: IntentExtractorService;
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
        IntentExtractorService,
        ConversationalCommandService
      ]
    });

    validationService = TestBed.inject(ValidationService);
    intentExtractorService = TestBed.inject(IntentExtractorService);
    conversationalCommandService = TestBed.inject(ConversationalCommandService);
  });

  describe('ValidationService - ageRange', () => {
    it('should validate standard range "X to Y"', () => {
      const result = validationService.validate('ageRange', '40 to 60');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('40 to 60');
    });

    it('should reject non "X to Y" formats', () => {
      const invalidValues = ['40-60', '40 260', '40260', '40', 'between 40 and 60'];
      for (const val of invalidValues) {
        const result = validationService.validate('ageRange', val);
        expect(result.valid).toBe(false);
        expect(result.errorMessage).toContain('Age range must be in the format "X to Y"');
      }
    });
  });

  describe('IntentExtractorService - Age Range Extraction', () => {
    it('should extract standard range formats as "X to Y"', () => {
      const testCases = [
        { text: 'between 40 and 60', expected: '40 to 60' },
        { text: 'from 40 to 60', expected: '40 to 60' },
        { text: '40 to 60', expected: '40 to 60' },
        { text: '40-60', expected: '40 to 60' },
        { text: '40 and 60', expected: '40 to 60' },
        { text: '40 60', expected: '40 to 60' }
      ];

      for (const testCase of testCases) {
        const intents = intentExtractorService.extractIntents(testCase.text, 'ageRange');
        const ageRangeIntent = intents.find(i => i.field === 'ageRange');
        expect(ageRangeIntent).toBeDefined();
        expect(ageRangeIntent?.value).toBe(testCase.expected);
        expect(ageRangeIntent?.confidence).toBe(0.9);
      }
    });

    it('should handle speech recognizer artifacts and normalize them', () => {
      const testCases = [
        { text: '40 260', expected: '40 to 60' },
        { text: '40260', expected: '40 to 60' },
        { text: '40 2 60', expected: '40 to 60' }
      ];

      for (const testCase of testCases) {
        const intents = intentExtractorService.extractIntents(testCase.text, 'ageRange');
        const ageRangeIntent = intents.find(i => i.field === 'ageRange');
        expect(ageRangeIntent).toBeDefined();
        expect(ageRangeIntent?.value).toBe(testCase.expected);
        expect(ageRangeIntent?.confidence).toBe(0.9);
      }
    });

    it('should infer ranges from 3-4 digit numbers with confidence 0.4', () => {
      const testCases = [
        { text: '214', expected: '2 to 14' },
        { text: '1024', expected: '10 to 24' }
      ];

      for (const testCase of testCases) {
        const intents = intentExtractorService.extractIntents(testCase.text, 'ageRange');
        const ageRangeIntent = intents.find(i => i.field === 'ageRange');
        expect(ageRangeIntent).toBeDefined();
        expect(ageRangeIntent?.value).toBe(testCase.expected);
        expect(ageRangeIntent?.confidence).toBe(0.4);
      }
    });

    it('should extract single digit fallbacks when active field is ageRange', () => {
      const intents = intentExtractorService.extractIntents('40', 'ageRange');
      const ageRangeIntent = intents.find(i => i.field === 'ageRange');
      expect(ageRangeIntent).toBeDefined();
      expect(ageRangeIntent?.value).toBe('40');
      expect(ageRangeIntent?.confidence).toBe(0.6);
    });
  });

  describe('ConversationalCommandService - Age Range Command & Pronoun Resolution', () => {
    it('should normalize explicit age range commands', () => {
      const command = conversationalCommandService.parseCommand(
        'change age range to 40 260',
        'change age range to 40 260',
        'siteCode',
        mockFields,
        null
      );
      expect(command.isCommand).toBe(true);
      expect(command.type).toBe('edit_field');
      expect(command.fieldId).toBe('ageRange');
      expect(command.value).toBe('40 to 60');
    });

    it('should resolve pronouns to ageRange and normalize the value', () => {
      const command = conversationalCommandService.parseCommand(
        'no make it 40260',
        'no make it 40260',
        'ageRange',
        mockFields,
        null
      );
      expect(command.isCommand).toBe(true);
      expect(command.type).toBe('correction');
      expect(command.fieldId).toBe('ageRange');
      expect(command.value).toBe('40 to 60');
    });

    it('should resolve "change that to between 40 and 60" to ageRange', () => {
      const command = conversationalCommandService.parseCommand(
        'change that to between 40 and 60',
        'change that to between 40 and 60',
        'siteCode',
        mockFields,
        null
      );
      expect(command.isCommand).toBe(true);
      expect(command.type).toBe('correction');
      expect(command.fieldId).toBe('ageRange');
      expect(command.value).toBe('40 to 60');
    });

    it('should extract semantic intents for age range', () => {
      const intents = conversationalCommandService.extractIntentsSemantically(
        'my age is 40 to 60',
        null,
        mockFields
      );
      const ageRangeIntent = intents.find(i => i.field === 'ageRange');
      expect(ageRangeIntent).toBeDefined();
      expect(ageRangeIntent?.value).toBe('40 to 60');
      expect(ageRangeIntent?.confidence).toBe(0.9);
    });
  });
});
