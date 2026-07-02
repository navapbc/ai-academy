import type { ReactNode } from 'react';

// The Nava layout container for primary content views: a centered column with
// responsive horizontal margins matching the Nava grid (p-8 → lg:p-12 → xl:p-16).
// Two widths by content type (per the Nava grid + readability):
//   - default (max-w-5xl ≈ 1024px) keeps lesson prose at a readable line length;
//   - `wide` (max-w-7xl ≈ 1280px, the 1440 desktop grid's content width) suits
//     data-dense staff/dashboard views.
// `active=false` hides the view while keeping it mounted, so view state and any
// in-flight fetches survive tab switches (the app's existing tab pattern).
export default function ContentContainer({
  active = true,
  wide = false,
  children,
}: {
  active?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  if (!active) return <div className="hidden">{children}</div>;
  return (
    <div className={`${wide ? 'max-w-7xl' : 'max-w-5xl'} mx-auto p-8 lg:p-12 xl:p-16`}>
      {children}
    </div>
  );
}
