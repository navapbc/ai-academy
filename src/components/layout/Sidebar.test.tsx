// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from './Sidebar';
import type { CurriculumSection, Module, UserProgress } from '../../types';

// Sidebar (restructure U2): the course tree (Course 1 → weeks) + "Supplemental
// coursework" + "Resources & additional lessons", all collapsible, nothing
// locked. Collapse defaults per the plan's UX decisions; plus the role-gated
// Staff entry (P5.1d).

const mod = (id: string, over: Partial<Module> = {}): Module => ({
  id,
  cellId: id,
  title: `Module ${id}`,
  type: 'content',
  content: '# Lesson',
  phaseId: '',
  origin: 'matrix',
  stage: '1a',
  visibility: 'public',
  status: 'published',
  dimension: ['Diligence'],
  evidenceType: 'quiz',
  selfReportValidity: 'medium',
  ...over,
});

const week1: CurriculumSection = {
  kind: 'week',
  id: 'week-w-1',
  week: 'Week 1',
  title: 'Break Claude on Purpose',
  description: '',
  courseId: 'c-1',
  courseTitle: 'Understanding & Deciding When to Use AI',
  modules: [mod('c1-w1-a', { origin: 'course', stage: null, phaseId: 'week-w-1' })],
};
const week2: CurriculumSection = {
  kind: 'week',
  id: 'week-w-2',
  week: 'Week 2',
  title: 'Ground & Scope',
  description: '',
  courseId: 'c-1',
  courseTitle: 'Understanding & Deciding When to Use AI',
  modules: [mod('c1-w2-a', { origin: 'course', stage: null, phaseId: 'week-w-2' })],
};
const supplemental: CurriculumSection = {
  kind: 'supplemental',
  id: 'supplemental',
  week: 'Supplemental',
  title: 'Supplemental coursework',
  description: '',
  modules: [mod('1.3', { phaseId: 'supplemental' }), mod('1.4', { phaseId: 'supplemental' })],
};
const resources: CurriculumSection = {
  kind: 'resources',
  id: 'resources',
  week: 'Resources',
  title: 'Resources & additional lessons',
  description: '',
  modules: [mod('custom-extra', { origin: 'custom', stage: null, phaseId: 'resources' })],
};

const SECTIONS = [week1, week2, supplemental, resources];

function renderSidebar({
  sections = SECTIONS,
  progress = { completedModuleIds: [], currentModuleId: 'c1-w1-a' } as UserProgress,
  isStaff = false,
  onViewChange = vi.fn(),
  onModuleSelect = vi.fn(),
} = {}) {
  const view = render(
    <Sidebar
      isOpen
      onClose={() => {}}
      sections={sections}
      progress={progress}
      onModuleSelect={onModuleSelect}
      overallProgress={0}
      onOpenSupport={() => {}}
      activeView="learning"
      onViewChange={onViewChange}
      isStaff={isStaff}
    />,
  );
  return { view, onViewChange, onModuleSelect };
}

const sectionToggle = (name: RegExp) => screen.getByRole('button', { name });

describe('Sidebar course tree (U2)', () => {
  test('shows the course heading with its weeks, then supplemental and resources', () => {
    renderSidebar();
    expect(screen.getByText('Understanding & Deciding When to Use AI')).toBeInTheDocument();
    expect(sectionToggle(/Break Claude on Purpose/)).toBeInTheDocument();
    expect(sectionToggle(/Ground & Scope/)).toBeInTheDocument();
    expect(sectionToggle(/Supplemental coursework/)).toBeInTheDocument();
    expect(sectionToggle(/Resources & additional lessons/)).toBeInTheDocument();
  });

  test('default expansion: only the section containing the current module is open', () => {
    renderSidebar(); // current module is in Week 1
    expect(sectionToggle(/Break Claude on Purpose/)).toHaveAttribute('aria-expanded', 'true');
    expect(sectionToggle(/Ground & Scope/)).toHaveAttribute('aria-expanded', 'false');
    expect(sectionToggle(/Supplemental coursework/)).toHaveAttribute('aria-expanded', 'false');
    expect(sectionToggle(/Resources & additional lessons/)).toHaveAttribute('aria-expanded', 'false');
    // Only the expanded section's module rows are rendered.
    expect(screen.getByRole('button', { name: /Module c1-w1-a/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Module 1\.3/ })).not.toBeInTheDocument();
  });

  test('a section header toggles its module list open and closed', async () => {
    renderSidebar();
    const user = userEvent.setup();
    await user.click(sectionToggle(/Supplemental coursework/));
    expect(sectionToggle(/Supplemental coursework/)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Module 1\.3/ })).toBeInTheDocument();
    await user.click(sectionToggle(/Supplemental coursework/));
    expect(screen.queryByRole('button', { name: /Module 1\.3/ })).not.toBeInTheDocument();
  });

  test('moving the current module (select/auto-advance) expands its section WITHOUT collapsing others', () => {
    const { view } = renderSidebar(); // Week 1 open
    view.rerender(
      <Sidebar
        isOpen
        onClose={() => {}}
        sections={SECTIONS}
        progress={{ completedModuleIds: [], currentModuleId: '1.4' }}
        onModuleSelect={() => {}}
        overallProgress={0}
        onOpenSupport={() => {}}
        activeView="learning"
        onViewChange={() => {}}
        isStaff={false}
      />,
    );
    // Supplemental (the new current section) opened; Week 1 stayed open.
    expect(sectionToggle(/Supplemental coursework/)).toHaveAttribute('aria-expanded', 'true');
    expect(sectionToggle(/Break Claude on Purpose/)).toHaveAttribute('aria-expanded', 'true');
  });

  test('clicking a module row selects it', async () => {
    const { onModuleSelect } = renderSidebar();
    await userEvent.setup().click(screen.getByRole('button', { name: /Module c1-w1-a/ }));
    expect(onModuleSelect).toHaveBeenCalledWith('c1-w1-a');
  });

  test('no lock UI anywhere: every module row is an interactive button (R14)', async () => {
    renderSidebar();
    const user = userEvent.setup();
    // Open everything, then assert no disabled/locked affordances exist.
    for (const name of [/Ground & Scope/, /Supplemental coursework/, /Resources & additional lessons/]) {
      await user.click(sectionToggle(name));
    }
    expect(document.querySelector('[aria-disabled="true"]')).toBeNull();
    expect(screen.queryByText(/Locked/i)).not.toBeInTheDocument();
    for (const section of SECTIONS) {
      for (const m of section.modules) {
        expect(screen.getByRole('button', { name: new RegExp(`Module ${m.id.replace('.', '\\.')}`) })).toBeEnabled();
      }
    }
  });

  test('the headline count intersects completions with the visible set (≤100%)', () => {
    renderSidebar({
      progress: { completedModuleIds: ['1.3', 'ghost-id', 'another-ghost'], currentModuleId: '1.3' },
    });
    // 5 visible modules across the fixtures; only 1.3 counts.
    expect(screen.getByText('1 of 5 complete')).toBeInTheDocument();
  });
});

describe('Sidebar staff entry (P5.1d)', () => {
  test('a learner sees no Staff entry', () => {
    renderSidebar({ isStaff: false });
    expect(screen.queryByRole('button', { name: /Staff/i })).not.toBeInTheDocument();
  });

  test('a staff user sees the Staff entry and it navigates to the staff view', async () => {
    const { onViewChange } = renderSidebar({ isStaff: true });
    const staffButton = screen.getByRole('button', { name: /Staff/i });
    expect(staffButton).toBeInTheDocument();
    await userEvent.setup().click(staffButton);
    expect(onViewChange).toHaveBeenCalledWith('staff');
  });
});
