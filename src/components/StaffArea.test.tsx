// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import StaffArea from './StaffArea';

// Stub the data-fetching children so the test exercises only the tile gating.
vi.mock('./staff/CohortDashboard', () => ({ default: () => <div data-testid="dashboard" /> }));
vi.mock('./staff/CohortManagement', () => ({ default: () => <div /> }));
vi.mock('./staff/ReviewQueue', () => ({ default: () => <div /> }));
vi.mock('./cms/CmsHome', () => ({ default: () => <div /> }));
vi.mock('./staff/UsageMonitoring', () => ({
  default: () => <div data-testid="usage-monitoring" />,
}));

describe('StaffArea CMS tile gating (P5.4-2, R5 UI half)', () => {
  test('admins see a live Content management tile', () => {
    render(<StaffArea role="admin" />);
    const tile = screen.getByRole('button', { name: /content management/i });
    expect(tile).toBeInTheDocument();
    // Live (not a "Soon" placeholder) — no upcoming-slice chip.
    expect(tile).not.toHaveTextContent(/soon/i);
  });

  test('champions do not get the live CMS tile (see it as upcoming)', () => {
    render(<StaffArea role="champion" />);
    expect(
      screen.queryByRole('button', { name: /content management/i }),
    ).not.toBeInTheDocument();
    // Shown as an upcoming tile instead.
    expect(screen.getByText(/content management/i)).toBeInTheDocument();
    expect(screen.getByText(/P5\.4 · admin/i)).toBeInTheDocument();
  });
});

describe('StaffArea usage-monitoring tile gating (P6.2)', () => {
  test('admins see a live Usage monitoring tile that opens the view', () => {
    render(<StaffArea role="admin" />);
    const tile = screen.getByRole('button', { name: /usage monitoring/i });
    expect(tile).toBeInTheDocument();
    // Live (not a "Soon" placeholder).
    expect(tile).not.toHaveTextContent(/soon/i);

    fireEvent.click(tile);
    expect(screen.getByTestId('usage-monitoring')).toBeInTheDocument();
  });

  test('champions do not get the live usage tile (see it as upcoming)', () => {
    render(<StaffArea role="champion" />);
    expect(
      screen.queryByRole('button', { name: /usage monitoring/i }),
    ).not.toBeInTheDocument();
    // Shown as an upcoming (ComingSoon) tile instead.
    expect(screen.getByText(/usage monitoring/i)).toBeInTheDocument();
    expect(screen.getByText(/P6\.2 · admin/i)).toBeInTheDocument();
  });
});
