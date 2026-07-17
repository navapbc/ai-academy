import type { LucideIcon } from 'lucide-react';
import { GraduationCap, BookOpen, Library, Compass, ArrowRight } from 'lucide-react';
import { BRANDING } from '../branding';

interface Props {
  onEnter: () => void;
}

interface StructureItem {
  icon: LucideIcon;
  title: string;
  desc: string;
  chipClass: string;
}

// Chip color rotates through the Nava palette (mint/green, mint/plum,
// navy/gold) so the three cards read as a deliberate trio rather than three
// copies of the same chip.
const STRUCTURE: StructureItem[] = [
  {
    icon: GraduationCap,
    title: 'Course weeks',
    desc: 'The champion-led cohort path — a guided, sequenced Course 1 program that builds your AI judgment step by step.',
    chipClass: 'bg-nava-plum/10 text-nava-plum',
  },
  {
    icon: BookOpen,
    title: 'Supplemental coursework',
    desc: 'The AI Literacy Skills Matrix — focused lessons you can explore any time, in any order. Nothing is locked.',
    chipClass: 'bg-nava-plum/10 text-nava-plum',
  },
  {
    icon: Library,
    title: 'Resources & additional lessons',
    desc: 'Standalone references and extras to support your practice as you go.',
    chipClass: 'bg-nava-navy text-nava-gold',
  },
];

export default function LandingPage({ onEnter }: Props) {
  return (
    <div className="relative min-h-screen overflow-hidden overflow-y-auto bg-nava-grey font-sans text-gray-900">
      {/* Subtle Nava "direction" brand pattern behind the whole page, matching
          the texture used on the sign-in screen (decorative). */}
      <div
        className="nava-pattern-direction pointer-events-none absolute inset-0 text-nava-navy opacity-[0.04]"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-4xl space-y-20 px-6 py-20 sm:py-24">
        <header className="animate-fade-up-in space-y-6 text-center">
          <div className="relative mx-auto h-20 w-20">
            {/* Offset mint tile behind the badge for a bit of layered depth. */}
            <div
              className="absolute inset-0 translate-x-2 translate-y-2 rounded-2xl bg-nava-plum/10"
              aria-hidden="true"
            />
            <div className="relative flex h-20 w-20 -rotate-3 items-center justify-center rounded-2xl border-2 border-nava-gold bg-nava-navy text-nava-gold shadow-lg">
              <GraduationCap className="h-9 w-9" aria-hidden="true" />
            </div>
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.3em] text-nava-plum">
            Welcome to
          </p>
          <h1 className="font-serif text-4xl font-bold tracking-tight text-nava-navy sm:text-5xl">
            {BRANDING.name}
          </h1>
          <div className="mx-auto h-1 w-16 rounded-full bg-nava-gold" aria-hidden="true" />
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-gray-600">
            Nava's AI-literacy training — a hands-on program for building the judgment to
            use AI well and responsibly in civic-tech work.
          </p>
        </header>

        <section
          className="animate-fade-up-in space-y-8"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex items-center justify-center gap-4">
            <span className="h-px w-10 bg-nava-plum/10" aria-hidden="true" />
            <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-gray-500">
              How it&apos;s organized
            </h2>
            <span className="h-px w-10 bg-nava-plum/10" aria-hidden="true" />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {STRUCTURE.map(({ icon: Icon, title, desc, chipClass }, i) => (
              <div
                key={title}
                className="animate-fade-up-in group relative space-y-4 rounded-3xl border-2 border-nava-plum/20 bg-white p-6 pt-9 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-nava-plum hover:shadow-xl"
                style={{ animationDelay: `${200 + i * 90}ms` }}
              >
                <span
                  className="pointer-events-none absolute -top-3 left-6 select-none font-serif text-5xl font-bold text-nava-plum/20"
                  aria-hidden="true"
                >
                  0{i + 1}
                </span>
                <div
                  className={`relative flex h-11 w-11 items-center justify-center rounded-xl ${chipClass}`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="font-bold text-nava-navy">{title}</h3>
                <p className="text-sm leading-relaxed text-gray-600">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          className="animate-fade-up-in rounded-3xl border-2 border-nava-plum/20 bg-white p-6 sm:p-8"
          style={{ animationDelay: '480ms' }}
        >
          <div className="mb-6 flex items-center gap-2">
            <Compass className="h-5 w-5 text-nava-plum" aria-hidden="true" />
            <h2 className="font-bold text-nava-navy">Finding your way around</h2>
          </div>
          <ol className="list-none space-y-5">
            <li className="flex items-start gap-4">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nava-plum/10 font-serif text-sm font-bold text-nava-plum"
                aria-hidden="true"
              >
                1
              </span>
              <p className="pt-1.5 text-sm leading-relaxed text-gray-600">
                Use the <strong className="text-nava-navy">sidebar</strong> on the left to
                move between lessons and sections.
              </p>
            </li>
            <li className="flex items-start gap-4">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nava-plum/10 font-serif text-sm font-bold text-nava-plum"
                aria-hidden="true"
              >
                2
              </span>
              <p className="pt-1.5 text-sm leading-relaxed text-gray-600">
                Hit <strong className="text-nava-navy">&ldquo;Mark as explored&rdquo;</strong>{' '}
                on any lesson to track your progress.
              </p>
            </li>
            <li className="flex items-start gap-4">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nava-plum/10 font-serif text-sm font-bold text-nava-plum"
                aria-hidden="true"
              >
                3
              </span>
              <p className="pt-1.5 text-sm leading-relaxed text-gray-600">
                The <strong className="text-nava-navy">study-buddy button</strong>{' '}
                (bottom-right) can answer questions any time.
              </p>
            </li>
          </ol>
        </section>

        <div
          className="animate-fade-up-in space-y-4 text-center"
          style={{ animationDelay: '560ms' }}
        >
          <p className="text-sm text-gray-500">Ready when you are.</p>
          <button
            onClick={onEnter}
            className="group inline-flex items-center gap-2 rounded-2xl bg-nava-green px-10 py-4 text-lg font-bold text-white shadow-lg shadow-nava-green/25 transition-all hover:bg-nava-green-dark active:scale-95"
          >
            Enter AI Academy
            <ArrowRight
              className="h-5 w-5 transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </div>
  );
}
