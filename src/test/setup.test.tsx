import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

describe('setup', () => {
  it('should provide jest-dom matchers', () => {
    const { getByText } = render(<div>Hello World</div>);
    expect(getByText('Hello World')).toBeInTheDocument();
  });
});
