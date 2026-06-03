import { ScanSearch } from 'lucide-react';
import type { CritiqueConfig } from '../../types';
import SourcedFreeTextLab from './SourcedFreeTextLab';

interface Props {
  config: CritiqueConfig;
  labId: string;
}

// The critique exercise (P4.3b): read a polished AI artifact, write a critique,
// graded in place by the LLM-judge. A thin wrapper over the shared
// SourcedFreeTextLab — it supplies only the critique-specific copy, the
// `Artifact under review` grade section label, and the ScanSearch icon. Like the
// other graded-practice exercises it records a lab_submissions row but is NOT the
// completion gate (the inline quiz is) — structurally enforced by Props being
// { config, labId } only (no onComplete).
const MIN_CRITIQUE_WORDS = 40;

export default function Critique({ config, labId }: Props) {
  const { title, subtitle, brief, artifact, rubric } = config;
  return (
    <SourcedFreeTextLab
      labId={labId}
      noun="critique"
      containerId="critique"
      icon={<ScanSearch className="w-5 h-5" />}
      title={title ?? 'Practice: Critique the artifact'}
      subtitle={
        subtitle ??
        'Read the AI-generated artifact and write a critique. This is graded practice — it doesn’t affect your module completion.'
      }
      source={artifact}
      sourceSectionLabel="Artifact under review"
      brief={brief}
      rubric={rubric}
      textareaPlaceholder="Which claims can you trust? Which can’t you verify from this document alone? What would you check first?"
      minWords={MIN_CRITIQUE_WORDS}
    />
  );
}
