// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PiiNotice from './PiiNotice';

// P6.3: the shared PII-reminder notice is presentational and accessible. It's the
// single source of truth for the reminder copy placed on every Claude-call surface.
describe('PiiNotice', () => {
  test('renders the reminder teaching copy', () => {
    render(<PiiNotice />);
    expect(
      screen.getByText(/don't paste real client or constituent data/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/use fake or sample data/i)).toBeInTheDocument();
  });

  test('applies a passed className', () => {
    const { container } = render(<PiiNotice className="mt-4" />);
    expect(container.firstChild).toHaveClass('mt-4');
  });
});
