import { Download, Share, X } from 'lucide-react';
import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        aria-label="Install Echo Lab app"
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#ff8c00]/50 bg-[#ff8c00]/15 px-3 py-1.5 text-xs font-semibold text-[#ffaa33] transition-colors hover:bg-[#ff8c00] hover:text-[#0a0a0f] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#ff8c00]"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Install</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          aria-label="Install Echo Lab on iOS"
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#222230] bg-[#1c1c24] px-2.5 py-1.5 text-xs font-medium text-[#e0e0e6] transition-colors hover:border-[#ff8c00]/60 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#ff8c00]"
        >
          <Share className="h-3.5 w-3.5 text-[#ff8c00]" aria-hidden="true" />
          <span>Install</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          >
            <div className="w-full max-w-sm rounded-xl border border-[#222230] bg-[#141419] p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 id="ios-install-title" className="text-base font-semibold text-[#e0e0e6]">
                  Install Echo Lab
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-[#808090] hover:bg-[#1c1c24] hover:text-[#e0e0e6]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-[#e0e0e6]">
                <li>1. Tap the Share button in the Safari toolbar.</li>
                <li>2. Scroll down and tap Add to Home Screen.</li>
                <li>3. Launch Echo Lab offline anytime from your home screen.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-lg bg-[#ff8c00] px-4 py-2 text-sm font-semibold text-[#0a0a0f]"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
