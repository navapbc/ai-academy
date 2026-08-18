import type { ComponentPropsWithoutRef } from 'react';
import type { Components } from 'react-markdown';

// Shared `components` override for every `<ReactMarkdown>` call site in the app.
// Markdown links have no syntax for `target`/`rel`, so without this override
// every link rendered from lesson or exercise content opens in the same tab,
// navigating the learner away from the course.
function ExternalLink({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) {
  const isExternal = typeof href === 'string' && /^https?:\/\//i.test(href);
  return (
    <a href={href} {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...props}>
      {children}
    </a>
  );
}

export const markdownComponents: Components = { a: ExternalLink };
