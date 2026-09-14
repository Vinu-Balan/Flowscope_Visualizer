import { describe, expect, it } from 'vitest';
import {
  describeCall,
  describeConstruct,
  describeDecision,
  describeReturn,
  describeThrow,
  domainNounFromPath,
  domainNounFromType,
  humanizeIdentifier,
} from './naming';

describe('domainNounFromType', () => {
  it('strips common bean suffixes', () => {
    expect(domainNounFromType('CustomerService')).toBe('Customer');
    expect(domainNounFromType('CustomerRepository')).toBe('Customer');
    expect(domainNounFromType('CustomerController')).toBe('Customer');
  });

  it('leaves a type with no recognized suffix unchanged', () => {
    expect(domainNounFromType('Customer')).toBe('Customer');
  });
});

describe('domainNounFromPath', () => {
  it('derives a singular noun from the last concrete path segment', () => {
    expect(domainNounFromPath('/customers')).toBe('Customer');
    expect(domainNounFromPath('/customers/{id}')).toBe('Customer');
  });
});

describe('humanizeIdentifier', () => {
  it('splits camelCase into title-case words', () => {
    expect(humanizeIdentifier('notFound')).toBe('Not Found');
    expect(humanizeIdentifier('sendWelcomeEmail')).toBe('Send Welcome Email');
  });
});

describe('describeCall', () => {
  it('recognizes findByX as a business-step lookup', () => {
    const result = describeCall('findByEmail', 'Customer');
    expect(result.type).toBe('business-step');
    expect(result.businessName).toBe('Find Customer by Email');
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('recognizes existsByX as a decision', () => {
    const result = describeCall('existsByEmail', 'Customer');
    expect(result.type).toBe('decision');
    expect(result.businessName).toBe('Check if Customer Exists by Email');
  });

  it('recognizes save/put as a database operation', () => {
    expect(describeCall('save', 'Customer').type).toBe('database-operation');
    expect(describeCall('put', 'Customer').type).toBe('database-operation');
  });

  it('recognizes register/create/add as a business step with a high confidence', () => {
    const result = describeCall('register', 'Customer');
    expect(result.type).toBe('business-step');
    expect(result.businessName).toBe('Register Customer');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('falls back to a low-confidence humanized name for an unrecognized method', () => {
    const result = describeCall('doTheThing', 'Customer');
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.businessName).toBe('Do The Thing');
  });
});

describe('describeReturn', () => {
  it('recognizes a success response builder call', () => {
    const result = describeReturn('ResponseEntity', 'ok');
    expect(result.type).toBe('response');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('recognizes a not-found response builder call as an error', () => {
    const result = describeReturn('ResponseEntity', 'notFound');
    expect(result.type).toBe('error');
    expect(result.businessName).toContain('Not Found');
  });

  it('falls back to a generic, lower-confidence response for an unrecognized return', () => {
    const result = describeReturn(undefined, undefined);
    expect(result.type).toBe('response');
    expect(result.confidence).toBeLessThan(0.6);
  });
});

describe('describeThrow / describeConstruct', () => {
  it('describes a throw as rejecting the domain noun', () => {
    const result = describeThrow('IllegalStateException', 'Customer');
    expect(result.type).toBe('error');
    expect(result.businessName).toBe('Reject Customer');
  });

  it('describes construction with a generated identifier at a higher confidence than plain construction', () => {
    const generated = describeConstruct('Customer', true);
    const plain = describeConstruct('Customer', false);
    expect(generated.businessName).toBe('Generate Customer');
    expect(plain.businessName).toBe('Create Customer');
    expect(generated.confidence).toBeGreaterThan(plain.confidence);
  });
});

describe('describeDecision', () => {
  it('reframes a resolvable condition call using describeCall', () => {
    const result = describeDecision(
      'existsByEmail(...)',
      { targetName: '', methodName: 'existsByEmail' },
      'Customer',
    );
    expect(result.type).toBe('decision');
    expect(result.businessName).toBe('Check if Customer Exists by Email');
  });

  it('recognizes a null-equality check without a call as "was found"', () => {
    const result = describeDecision('customer == null', undefined, 'Customer');
    expect(result.businessName).toBe('Check if Customer was Found');
  });

  it('recognizes a not-null check without a call as "exists"', () => {
    const result = describeDecision('customer != null', undefined, 'Customer');
    expect(result.businessName).toBe('Check if Customer Exists');
  });

  it('falls back to a low-confidence generic condition description', () => {
    const result = describeDecision('a > b', undefined, 'Customer');
    expect(result.confidence).toBeLessThan(0.5);
  });
});
