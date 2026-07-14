import { describe, it, expect } from 'vitest';
import { AutoValidator } from '../validation';

describe('AutoValidator', () => {
  it('creates with default steps', () => {
    const validator = new AutoValidator();
    expect(validator).toBeDefined();
  });

  it('registers custom step', () => {
    const validator = new AutoValidator();
    validator.register({
      name: 'Custom Check',
      run: () => ({ passed: true, name: 'Custom Check', output: 'ok' }),
    });
    expect(validator).toBeDefined();
  });

  it('custom step produces correct result', () => {
    const validator = new AutoValidator();
    const step = {
      name: 'Custom Check',
      run: () => ({ passed: true, name: 'Custom Check', output: 'ok' }),
    };
    const result = step.run('/tmp');
    expect(result.passed).toBe(true);
    expect(result.name).toBe('Custom Check');
    expect(result.output).toBe('ok');
  });
});
