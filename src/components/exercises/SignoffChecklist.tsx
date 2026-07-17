import { useState } from 'react';
import { motion } from 'motion/react';
import { ClipboardCheck, Check, Sparkles } from 'lucide-react';
import type { SignoffConfig } from '../../types';
import { useAuth } from '../../lib/auth';
import { recordLabSubmission } from '../../lib/progress';

interface Props {
  config: SignoffConfig;
  labId: string;
}

export default function SignoffChecklist({ config, labId }: Props) {
  const { user } = useAuth();
  const { intro, roles, commitments } = config;
  const [role, setRole] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [signed, setSigned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const allChecked = commitments.every((c) => checked[c.id]);
  const canSign = role !== null && allChecked;

  const toggle = (id: string) => {
    if (signed) return;
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSignoff = async () => {
    if (!canSign || signed) return;
    setSaveError(null);
    if (!user) {
      setSaveError('Sign in to record your sign-off.');
      return;
    }
    setSaving(true);
    try {
      await recordLabSubmission(user.id, {
        labId,
        transcript: {
          role,
          acknowledged: commitments.map((c) => c.id),
          signedAt: new Date().toISOString(),
        },
        status: 'submitted',
      });
      setSigned(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not record your sign-off.');
    } finally {
      setSaving(false);
    }
  };

  if (signed) {
    const roleLabel = roles.find((r) => r.id === role)?.label ?? role;
    return (
      <div className="bg-white border-2 border-nava-plum/20 rounded-3xl p-8 shadow-sm text-center space-y-4" id="signoff-checklist">
        <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-xl font-bold">Signed off</h3>
        <p className="text-sm text-gray-500">
          Recorded as <span className="font-semibold text-nava-plum">{roleLabel}</span>. You committed
          to all {commitments.length} responsible-use practices.
        </p>
        <button
          type="button"
          onClick={() => setSigned(false)}
          className="text-xs font-bold text-gray-500 hover:text-nava-plum underline"
        >
          Edit / re-sign
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-nava-plum/20 rounded-3xl p-8 shadow-sm space-y-8" id="signoff-checklist">
      <div className="flex items-center gap-3 border-b border-nava-plum/20 pb-6">
        <div className="w-10 h-10 bg-nava-plum/10 rounded-xl flex items-center justify-center text-nava-plum">
          <ClipboardCheck className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">Your role &amp; sign-off</h3>
          {intro && <p className="text-xs text-gray-500">{intro}</p>}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-800">Which best fits how you&apos;re involved with AI?</p>
        <div role="radiogroup" aria-label="Your role" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {roles.map((r) => {
            const sel = role === r.id;
            return (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={sel}
                onClick={() => setRole(r.id)}
                className={`text-left rounded-xl px-4 py-3 border-2 transition-all ${
                  sel ? 'border-nava-green bg-nava-mint' : 'border-gray-100 hover:border-nava-green/30'
                }`}
              >
                <span className={`text-sm font-bold ${sel ? 'text-nava-green' : 'text-gray-700'}`}>{r.label}</span>
                <span className="block text-xs text-gray-500 mt-0.5">{r.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-800">Commitments — check each to sign off:</p>
        <div role="group" aria-label="Commitments" className="space-y-2">
          {commitments.map((c) => {
            const on = !!checked[c.id];
            return (
              <button
                key={c.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(c.id)}
                className={`w-full text-left flex items-start gap-3 rounded-xl px-4 py-3 border-2 transition-all ${
                  on ? 'border-nava-green bg-nava-mint/50' : 'border-gray-100 hover:border-nava-green/30'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                    on ? 'bg-nava-green border-nava-green' : 'border-gray-300'
                  }`}
                >
                  {on && <Check className="w-3.5 h-3.5 text-white" />}
                </span>
                <span className="text-sm text-gray-700">{c.text}</span>
              </button>
            );
          })}
        </div>
      </div>

      {saveError && <p role="alert" className="text-xs text-red-600 font-medium">{saveError}</p>}

      <div className="flex justify-end border-t border-gray-100 pt-6">
        <button
          type="button"
          onClick={handleSignoff}
          disabled={!canSign || saving}
          className="flex items-center gap-2 px-10 py-3 bg-nava-green text-white rounded-xl font-bold shadow-lg shadow-nava-green/20 disabled:opacity-50 transition-all active:scale-95"
        >
          {saving ? (
            <>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                <Sparkles className="w-4 h-4" />
              </motion.div>
              Signing…
            </>
          ) : (
            'Sign off'
          )}
        </button>
      </div>
    </div>
  );
}
