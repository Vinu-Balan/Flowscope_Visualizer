import { describe, expect, it } from 'vitest';
import {
  describeCall,
  describeConstruct,
  describeDecision,
  describeReturn,
  describeThrow,
  describeViewReturn,
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
  it('reframes a resolvable condition call using describeCall, with the guard branch as "Yes"', () => {
    const result = describeDecision(
      'existsByEmail(...)',
      { targetName: '', methodName: 'existsByEmail' },
      'Customer',
    );
    expect(result.type).toBe('decision');
    expect(result.businessName).toBe('Check if Customer Exists by Email');
    expect(result.affirmativeBranch).toBe('guard');
  });

  it('recognizes a null-equality check without a call as "was found", with the guard branch as "No"', () => {
    const result = describeDecision('customer == null', undefined, 'Customer');
    expect(result.businessName).toBe('Check if Customer was Found');
    // The guard fires when the raw check is true (customer IS null, i.e.
    // NOT found) — that's "No" to "was it found?", not "Yes".
    expect(result.affirmativeBranch).toBe('continue');
  });

  it('recognizes a not-null check without a call as "exists", with the guard branch as "Yes"', () => {
    const result = describeDecision('customer != null', undefined, 'Customer');
    expect(result.businessName).toBe('Check if Customer Exists');
    expect(result.affirmativeBranch).toBe('guard');
  });

  it('falls back to a low-confidence generic condition description', () => {
    const result = describeDecision('a > b', undefined, 'Customer');
    expect(result.confidence).toBeLessThan(0.5);
  });
});

describe('describeCall — Model/ModelAndView population (docs/sprints/SPRINT-7.md)', () => {
  it('names an addAttribute call after its literal key, not generically', () => {
    const withKey = describeCall('addAttribute', 'Admin', 'username');
    expect(withKey.businessName).toBe('Prepare "username" for Display');

    const withOtherKey = describeCall('addAttribute', 'Admin', 'errors');
    expect(withOtherKey.businessName).toBe('Prepare "errors" for Display');

    // Two different calls to the same method must not render identically —
    // the exact complaint this sprint responds to.
    expect(withKey.businessName).not.toBe(withOtherKey.businessName);
  });

  it('recognizes addObject (ModelAndView) the same way as addAttribute (Model)', () => {
    const result = describeCall('addObject', 'Admin', 'products');
    expect(result.businessName).toBe('Prepare "products" for Display');
    expect(result.type).toBe('transformation');
  });

  it('falls back to a generic phrase when addAttribute has no literal key', () => {
    const result = describeCall('addAttribute', 'Admin');
    expect(result.businessName).toBe('Prepare Admin Data for Display');
    expect(result.confidence).toBeLessThan(0.6);
  });
});

describe('describeCall — setXxx property mutators (docs/sprints/SPRINT-7.md)', () => {
  it('names a setter after the property it sets', () => {
    const result = describeCall('setName', 'Product');
    expect(result.businessName).toBe('Set Name');
    expect(result.type).toBe('transformation');
  });

  it('produces distinct names for different setters', () => {
    expect(describeCall('setCategory', 'Product').businessName).toBe('Set Category');
    expect(describeCall('setPrice', 'Product').businessName).toBe('Set Price');
  });
});

describe('describeCall — fallback enrichment with a string argument (docs/sprints/SPRINT-7.md)', () => {
  it('appends the literal argument so two unrecognized calls differ', () => {
    const first = describeCall('doTheThing', 'Customer', 'alpha');
    const second = describeCall('doTheThing', 'Customer', 'beta');
    expect(first.businessName).toContain('alpha');
    expect(second.businessName).toContain('beta');
    expect(first.businessName).not.toBe(second.businessName);
  });
});

describe('describeViewReturn (docs/sprints/SPRINT-7.md)', () => {
  it('describes a redirect view name', () => {
    const result = describeViewReturn('redirect:/admin/products');
    expect(result.businessName).toBe('Redirect to Admin Products');
    expect(result.type).toBe('response');
  });

  it('describes a forward view name', () => {
    const result = describeViewReturn('forward:/checkout');
    expect(result.businessName).toBe('Forward to Checkout');
  });

  it('describes a plain view name as a rendered page', () => {
    const result = describeViewReturn('customer/list');
    expect(result.businessName).toBe('Show Customer List Page');
  });

  it('produces distinct names for different view names, unlike the old generic "Return Response"', () => {
    const index = describeViewReturn('index');
    const login = describeViewReturn('adminlogin');
    expect(index.businessName).not.toBe(login.businessName);
  });
});

describe('describeThrow with a message (docs/sprints/SPRINT-7.md)', () => {
  it('folds the message into the description when present', () => {
    const result = describeThrow('IllegalStateException', 'Customer', 'Email already exists: ');
    expect(result.businessDescription).toContain('Email already exists');
  });

  it('falls back to the exception type alone when no message is available', () => {
    const result = describeThrow('IllegalStateException', 'Customer');
    expect(result.businessDescription).toBe('Throws `IllegalStateException`.');
  });
});
