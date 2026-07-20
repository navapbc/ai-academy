// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModulePager from './ModulePager';
import type { Module } from '../types';

// Week-flow Next/Previous controls (U2/R4): pure navigation over the flattened
// visible order — never a completion path (U9 owns completion semantics).

const mod = (id: string, title: string): Module => ({
  id,
  cellId: id,
  title,
  type: 'content',
  content: '',
  phaseId: 'supplemental',
  origin: 'matrix',
  stage: '1a',
  visibility: 'public',
  status: 'published',
  dimension: ['Diligence'],
  evidenceType: 'quiz',
  selfReportValidity: 'medium',
  progressResetAt: null,
});

const MODULES = [mod('1.1', 'First lesson'), mod('1.2', 'Middle lesson'), mod('1.3', 'Last lesson')];

describe('ModulePager (U2 week flow)', () => {
  test('renders Previous and Next with the neighbouring module titles', () => {
    render(<ModulePager modules={MODULES} currentModuleId="1.2" onSelect={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Lesson navigation' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Previous\s*First lesson/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next\s*Last lesson/ })).toBeInTheDocument();
  });

  test('the first module has no Previous; the last has no Next', () => {
    const first = render(<ModulePager modules={MODULES} currentModuleId="1.1" onSelect={() => {}} />);
    expect(screen.queryByRole('button', { name: /Previous/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next\s*Middle lesson/ })).toBeInTheDocument();
    first.unmount();

    render(<ModulePager modules={MODULES} currentModuleId="1.3" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /Previous\s*Middle lesson/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Next/ })).not.toBeInTheDocument();
  });

  test('clicking Next / Previous selects the neighbouring module (navigation only)', async () => {
    const onSelect = vi.fn();
    render(<ModulePager modules={MODULES} currentModuleId="1.2" onSelect={onSelect} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Next\s*Last lesson/ }));
    expect(onSelect).toHaveBeenCalledWith('1.3');
    await user.click(screen.getByRole('button', { name: /Previous\s*First lesson/ }));
    expect(onSelect).toHaveBeenCalledWith('1.1');
  });

  test('renders nothing for an unknown current module or a single-module curriculum', () => {
    const unknown = render(<ModulePager modules={MODULES} currentModuleId="ghost" onSelect={() => {}} />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    unknown.unmount();

    render(<ModulePager modules={[mod('1.1', 'Only lesson')]} currentModuleId="1.1" onSelect={() => {}} />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
