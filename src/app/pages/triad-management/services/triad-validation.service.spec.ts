import { TestBed } from '@angular/core/testing'

import { TriadGroupFormData } from '../interfaces/triad-group.interface'
import { TriadValidationService } from './triad-validation.service'

describe('TriadValidationService', () => {
	let service: TriadValidationService

	beforeEach(() => {
		TestBed.configureTestingModule({})
		service = TestBed.inject(TriadValidationService)
	})

	it('should be created', () => {
		expect(service).toBeTruthy()
	})

	it('should validate a correct triad group', () => {
		const validData: TriadGroupFormData = {
			difficulty: 'EASY',
			triad1: { keyword: 'TEST', fullPhrases: ['TEST1', 'TEST2', 'TEST3'] },
			triad2: { keyword: 'SAMPLE', fullPhrases: ['SAMPLE1', 'SAMPLE2', 'SAMPLE3'] },
			triad3: { keyword: 'DEMO', fullPhrases: ['DEMO1', 'DEMO2', 'DEMO3'] },
			triad4: { keyword: 'FINAL', fullPhrases: ['TEST FINAL', 'SAMPLE FINAL', 'DEMO FINAL'] },
		}

		const result = service.validateTriadGroup(validData)
		expect(result.valid).toBe(true)
		expect(result.errors.length).toBe(0)
	})

	it('should fail validation when keyword is missing', () => {
		const invalidData: TriadGroupFormData = {
			difficulty: 'EASY',
			triad1: { keyword: '', fullPhrases: ['TEST1', 'TEST2', 'TEST3'] },
			triad2: { keyword: 'SAMPLE', fullPhrases: ['SAMPLE1', 'SAMPLE2', 'SAMPLE3'] },
			triad3: { keyword: 'DEMO', fullPhrases: ['DEMO1', 'DEMO2', 'DEMO3'] },
			triad4: { keyword: 'FINAL', fullPhrases: ['TEST FINAL', 'SAMPLE FINAL', 'DEMO FINAL'] },
		}

		const result = service.validateTriadGroup(invalidData)
		expect(result.valid).toBe(false)
		expect(result.errors.some((e) => e.includes('Keyword is required'))).toBe(true)
	})

	it('should fail validation when full phrases count is not 3', () => {
		const invalidData = {
			difficulty: 'EASY',
			triad1: { keyword: 'TEST', fullPhrases: ['TEST1', 'TEST2'] },
			triad2: { keyword: 'SAMPLE', fullPhrases: ['SAMPLE1', 'SAMPLE2', 'SAMPLE3'] },
			triad3: { keyword: 'DEMO', fullPhrases: ['DEMO1', 'DEMO2', 'DEMO3'] },
			triad4: { keyword: 'FINAL', fullPhrases: ['TEST FINAL', 'SAMPLE FINAL', 'DEMO FINAL'] },
		} as unknown as TriadGroupFormData

		const result = service.validateTriadGroup(invalidData)
		expect(result.valid).toBe(false)
		expect(result.errors.some((e) => e.includes('Exactly 3 full phrases are required'))).toBe(true)
	})

	it('should fail validation when keyword is not substring of full phrase', () => {
		const invalidData: TriadGroupFormData = {
			difficulty: 'EASY',
			triad1: { keyword: 'TEST', fullPhrases: ['WRONG1', 'TEST2', 'TEST3'] },
			triad2: { keyword: 'SAMPLE', fullPhrases: ['SAMPLE1', 'SAMPLE2', 'SAMPLE3'] },
			triad3: { keyword: 'DEMO', fullPhrases: ['DEMO1', 'DEMO2', 'DEMO3'] },
			triad4: { keyword: 'FINAL', fullPhrases: ['TEST FINAL', 'SAMPLE FINAL', 'DEMO FINAL'] },
		}

		const result = service.validateTriadGroup(invalidData)
		expect(result.valid).toBe(false)
		expect(result.errors.some((e) => e.includes('must be a substring of Word'))).toBe(true)
	})

	it('should accept a final triad when a one-letter cue appears incidentally in other full phrases', () => {
		const validData: TriadGroupFormData = {
			difficulty: 'EASY',
			triad1: { keyword: 'AUTO', fullPhrases: ['AUTOBIOGRAPHICAL', 'AUTOPILOT', 'GRAND THEFT AUTO'] },
			triad2: { keyword: 'E', fullPhrases: ['E-READER', 'EMAIL', 'E-SIGNATURE'] },
			triad3: { keyword: 'PROFIT', fullPhrases: ['PROFIT SHARING', 'PROFIT MARGIN', 'NOT FOR PROFIT'] },
			triad4: { keyword: 'MOTIVE', fullPhrases: ['AUTOMOTIVE', 'PROFIT MOTIVE', 'EMOTIVE'] },
		}

		const result = service.validateTriadGroup(validData)
		expect(result).toEqual({ valid: true, errors: [] })
	})

	it('should fail validation when triad 4 cues do not match triads 1-3 keywords', () => {
		const invalidData: TriadGroupFormData = {
			difficulty: 'EASY',
			triad1: { keyword: 'TEST', fullPhrases: ['TEST1', 'TEST2', 'TEST3'] },
			triad2: { keyword: 'SAMPLE', fullPhrases: ['SAMPLE1', 'SAMPLE2', 'SAMPLE3'] },
			triad3: { keyword: 'DEMO', fullPhrases: ['DEMO1', 'DEMO2', 'DEMO3'] },
			triad4: { keyword: 'FINAL', fullPhrases: ['TEST FINAL', 'SAMPLE FINAL', 'WRONG FINAL'] },
		}

		const result = service.validateTriadGroup(invalidData)
		expect(result.valid).toBe(false)
		expect(result.errors.some((e) => e.includes('Triad 4 receipt failed') && e.includes('Triad 3 (DEMO)'))).toBe(true)
	})
})
