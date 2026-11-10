import { useEffect, useRef, useState } from 'react';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { logoPaths, logoCropClasses } from './logos';

/** Keyframes/functions live in `endow.css` alongside this component. The
 *  splash plays once per browser session, is skippable, and shows a static
 *  logo instead of the reveal for `prefers-reduced-motion`. Video is muted,
 *  autoplaying and inline so no browser blocks the reveal. */

const SPLASH_KEY = 'endowgpt.splash.played';
const MAX_VIDEO_MS = 2500;
const STATIC_MS = 400;

const playedThisSession = (): boolean => {
  try {
    return window.sessionStorage.getItem(SPLASH_KEY) === '1';
  } catch {
    // Storage refused (e.g. hardened privacy settings): better to never show
    // than to repeat on every navigation.
    return true;
  }
};

const markPlayed = (): void => {
  try {
    window.sessionStorage.setItem(SPLASH_KEY, '1');
  } catch {
    /* Refusal only shortens the effect; nothing to recover. */
  }
};

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

type SplashMode = 'none' | 'static' | 'video';

export default function LogoSplash() {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const enabled = startupConfig?.interface?.logoSplash !== false;
  /** Decided once per mount: a deployment that turns the splash on later must
   *  not replay it mid-session, and one that turns it off hides it as soon as
   *  the config lands (which may be after the video already started). */
  const [mode, decide] = useState<SplashMode>(() => {
    if (playedThisSession()) {
      return 'none';
    }
    return prefersReducedMotion() ? 'static' : 'video';
  });
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    if (mode === 'none') {
      return;
    }
    if (!enabled) {
      decide('none');
      return;
    }
    const hold = mode === 'video' ? MAX_VIDEO_MS : STATIC_MS;
    timers.current.push(setTimeout(() => setLeaving(true), hold));
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [mode, enabled]);

  useEffect(() => {
    if (!leaving) {
      return;
    }
    /** Exit animation fully paints before the overlay unmounts; the video's
     *  `ended` and the skip button both route through `setLeaving(True)`. */
    timers.current.push(setTimeout(() => decide('none'), 380));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        decide('none');
        markPlayed();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [leaving]);

  useEffect(() => {
    if (mode === 'none') {
      markPlayed();
    }
  }, [mode]);

  // The splash's lifecycle ends on route change too (partial outro); either
  // path means the session saw it.
  useEffect(() => () => markPlayed(), []);

  if (mode === 'none') {
    return null;
  }

  return (
    /* The splash background matches the reveal video's own white; it is media-
       matched on purpose, so the reveal never shows a seam against a themed
       surface. Not a theme token by design. */
    <div
      className="endow-splash-enter bg-white fixed inset-0 z-[9999] flex items-center justify-center"
      role="img"
      aria-label={localize('com_ui_app_title')}
      data-testid="endow-splash"
    >
      {mode === 'video' ? (
        <video
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={() => setLeaving(true)}
          className="endow-splash max-h-[85vh] max-w-[85vw] h-auto w-auto"
        >
          <source src={logoPaths.splashVideoWebm} type="video/webm" />
          {/* mp4 fallback keeps the reveal on Safari and older Edge builds */}
          <source src={logoPaths.splashVideoMp4} type="video/mp4" />
        </video>
      ) : (
        <img
          src={logoPaths.mark}
          srcSet={`${logoPaths.mark} 1x, ${logoPaths.mark2x} 2x`}
          alt=""
          className={`max-h-[85vh] max-w-[85vw] ${logoCropClasses}`}
        />
      )}
      <button
        type="button"
        onClick={() => {
          decide('none');
          markPlayed();
        }}
        className="text-text-secondary hover:text-text-primary absolute bottom-6 right-8 rounded-lg px-3 py-1.5 text-sm transition-colors"
      >
        {localize('com_ui_splash_skip')}
      </button>
    </div>
  );
}
