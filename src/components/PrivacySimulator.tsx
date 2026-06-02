import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cloud, Laptop, Shield, ShieldAlert, CheckCircle, Play, ShieldCheck } from 'lucide-react';

export default function PrivacySimulator({ onComplete }: { onComplete: () => void }) {
  const [mode, setMode] = useState<'cloud' | 'local'>('cloud');
  const [isSimulating, setIsSimulating] = useState(false);
  const [steps, setSteps] = useState<number>(0);

  const startSimulation = () => {
    setIsSimulating(true);
    setSteps(0);
    const interval = setInterval(() => {
      setSteps(prev => {
        if (prev >= 3) {
          clearInterval(interval);
          setIsSimulating(false);
          return 3;
        }
        return prev + 1;
      });
    }, 1000);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm space-y-8" id="privacy-simulator">
      <div className="flex items-center justify-between border-b border-gray-100 pb-6">
        <div>
          <h3 className="text-xl font-bold">Privacy Simulator</h3>
          <p className="text-gray-500 text-sm">Visualize how data flows in different AI architectures.</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setMode('cloud')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'cloud' ? 'bg-white shadow text-nava-plum' : 'text-gray-500'}`}
          >
            Cloud AI
          </button>
          <button
            onClick={() => setMode('local')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'local' ? 'bg-white shadow text-nava-plum' : 'text-gray-500'}`}
          >
            Local AI
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex gap-3 -mt-4 animate-in fade-in slide-in-from-top-2">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-blue-900">Architecture Matters</h4>
          <p className="text-xs text-blue-700 leading-relaxed">
            In government service, where we process PII, the physical location of the data is a legal requirement. 
            Choose a mode above to see the difference in flow.
          </p>
        </div>
      </div>

      <div className="h-64 relative flex items-center justify-around px-12">
        {/* User Laptop */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-20 h-20 bg-gray-50 rounded-2xl border-2 border-gray-200 flex items-center justify-center relative">
            <Laptop className="w-10 h-10 text-gray-500" />
            {isSimulating && steps === 0 && (
              <motion.div 
                layoutId="data-packet"
                className="absolute w-4 h-4 bg-nava-plum rounded-full"
              />
            )}
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Your Device</span>
        </div>

        {/* Path */}
        <div className="flex-1 h-px bg-dashed border-t-2 border-dashed border-gray-200 mx-8 relative">
          <AnimatePresence>
            {isSimulating && steps > 0 && steps < 3 && (
              <motion.div 
                initial={{ left: '0%' }}
                animate={{ left: mode === 'cloud' ? '100%' : '50%' }}
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-nava-plum rounded-full shadow-lg shadow-nava-plum/20"
              />
            )}
          </AnimatePresence>
          {mode === 'local' && (
            <div className="absolute left-1/2 -translate-x-1/2 -top-10 flex flex-col items-center">
              <Shield className="w-8 h-8 text-green-600 mb-1" />
              <span className="text-[10px] font-bold text-green-600 uppercase">Privacy Barrier</span>
            </div>
          )}
        </div>

        {/* Destination */}
        <div className="flex flex-col items-center gap-2">
          <div className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center relative ${mode === 'cloud' ? 'bg-nava-mint border-nava-green' : 'bg-gray-50 border-gray-200 opacity-50'}`}>
            <Cloud className={`w-10 h-10 ${mode === 'cloud' ? 'text-nava-green' : 'text-gray-500'}`} />
            {isSimulating && steps === 3 && mode === 'cloud' && (
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute w-4 h-4 bg-nava-plum rounded-full"
              />
            )}
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Cloud Server</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 bg-gray-50 p-6 rounded-2xl">
        <div className="space-y-2">
          <h4 className="font-bold text-sm flex items-center gap-2">
            {mode === 'cloud' ? <ShieldAlert className="w-4 h-4 text-nava-plum" /> : <ShieldCheck className="w-4 h-4 text-green-600" />}
            {mode === 'cloud' ? 'Data Exposure Risk' : 'Data Sovereignty'}
          </h4>
          <p className="text-xs text-gray-500 leading-relaxed">
            {mode === 'cloud' 
              ? 'Your query leaves your device and is processed on a third-party server. Privacy depends on the provider\'s terms.' 
              : 'The model and your data strictly stay on your local machine. No external prying eyes or data logs.'}
          </p>
        </div>
        <div className="flex items-end justify-end">
          {!isSimulating && steps < 3 && (
            <button
              onClick={startSimulation}
              className="px-6 py-3 bg-nava-green text-white rounded-xl font-bold text-sm hover:bg-nava-plum transition-all flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              Simulate Flow
            </button>
          )}
          {steps === 3 && (
            <button
              onClick={onComplete}
              className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2"
            >
              Complete Simulation
              <CheckCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
