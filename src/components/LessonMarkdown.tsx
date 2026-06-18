import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { injectBranding } from '../branding';

// The single learner-facing markdown renderer for lesson bodies. Extracted from
// ModuleRenderer (P5.4-3) so the admin CMS live-preview reuses the EXACT same
// render — preview ≡ published lesson (R9). Both call sites pass raw markdown;
// branding placeholders are injected here so neither has to remember to.
export default function LessonMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-slate max-w-none prose-headings:font-bold prose-h1:text-4xl prose-h1:text-nava-plum prose-h1:tracking-tight prose-h2:text-nava-plum prose-h3:text-gray-800 prose-p:text-gray-600 prose-p:leading-relaxed prose-li:text-gray-600 prose-li:leading-relaxed prose-strong:text-gray-800 prose-a:text-nava-plum prose-a:font-medium prose-a:no-underline hover:prose-a:underline prose-code:text-nava-plum prose-code:bg-gray-100 prose-code:rounded prose-code:px-1 prose-code:font-normal prose-blockquote:border-l-nava-plum prose-blockquote:text-gray-500 prose-hr:border-gray-200">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{injectBranding(content)}</ReactMarkdown>
    </div>
  );
}
