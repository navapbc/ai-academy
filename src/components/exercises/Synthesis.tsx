import { Layers } from 'lucide-react';
import type { SynthesisConfig } from '../../types';
import SourcedFreeTextLab from './SourcedFreeTextLab';

interface Props {
  config: SynthesisConfig;
  labId: string;
}

// The synthesis exercise (P4.4a): read sourced excerpts (interview notes), write a
// synthesis that keeps the minority voice instead of flattening it into a tidy
// false consensus, graded in place by the LLM-judge. A thin wrapper over the
// shared SourcedFreeTextLab — it supplies only the synthesis-specific copy, the
// `Source excerpts` grade section label, and the Layers icon. Like the other
// graded-practice exercises it records a lab_submissions row but is NOT the
// completion gate (the inline quiz is) — structurally enforced by Props being
// { config, labId } only (no onComplete). A synthesis names themes + weighting +
// follow-up, so the floor sits a little above the critique's.
const MIN_SYNTHESIS_WORDS = 50;

export default function Synthesis({ config, labId }: Props) {
  const { title, subtitle, brief, sources, rubric } = config;
  return (
    <SourcedFreeTextLab
      labId={labId}
      noun="synthesis"
      containerId="synthesis"
      icon={<Layers className="w-5 h-5" />}
      title={title ?? 'Practice: synthesize the research — keep the voice that matters'}
      subtitle={
        subtitle ??
        'Compress these notes into themes for the readout. This is graded practice — it doesn’t affect your module completion.'
      }
      source={sources}
      sourceSectionLabel="Source excerpts"
      brief={brief}
      rubric={rubric}
      textareaPlaceholder="What are the themes? How widely was each felt — and whose reaction got dropped if you only kept the tidy ones? What still needs follow-up?"
      minWords={MIN_SYNTHESIS_WORDS}
    />
  );
}
