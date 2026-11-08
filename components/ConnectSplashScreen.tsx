'use client';

import { useEffect, useState } from 'react';

const BRAND = 'Connect'.split('');

type Props = {
  ready: boolean;
  onComplete: () => void;
};

/**
 * The letters are the only loading indicator: the final "t" is revealed only
 * after the initial session and chat directory have finished loading.
 */
export default function ConnectSplashScreen({ ready, onComplete }: Props) {
  const [letters, setLetters] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (letters >= BRAND.length - 1) return;
    const timer = window.setTimeout(() => setLetters(letters + 1), 200);
    return () => window.clearTimeout(timer);
  }, [letters]);

  useEffect(() => {
    if (!ready || letters !== BRAND.length - 1) return;
    const timer = window.setTimeout(() => setLetters(BRAND.length), 200);
    return () => window.clearTimeout(timer);
  }, [ready, letters]);

  useEffect(() => {
    if (!ready || letters !== BRAND.length) return;
    const fade = window.setTimeout(() => setLeaving(true), 300);
    const done = window.setTimeout(onComplete, 750);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(done);
    };
  }, [ready, letters, onComplete]);

  // Network failures must not leave a permanent overlay in front of login.
  useEffect(() => {
    const timeout = window.setTimeout(onComplete, 12000);
    return () => window.clearTimeout(timeout);
  }, [onComplete]);

  return (
    <div className={'connect-splash' + (leaving ? ' connect-splash--leaving' : '')}
      role="status" aria-label="Загрузка Connect">
      <svg className="connect-splash__waves" viewBox="0 0 430 900"
        preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="splashUpper" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#15b5ff" stopOpacity=".85"/>
            <stop offset=".5" stopColor="#0067e8" stopOpacity=".63"/>
            <stop offset="1" stopColor="#053ebd" stopOpacity=".08"/>
          </linearGradient>
          <linearGradient id="splashLower" x1="0" y1="0" x2=".7" y2="1">
            <stop offset="0" stopColor="#009aff" stopOpacity=".15"/>
            <stop offset=".43" stopColor="#078bfa" stopOpacity=".78"/>
            <stop offset="1" stopColor="#063bc4" stopOpacity=".7"/>
          </linearGradient>
          <linearGradient id="splashEdge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#3caefb" stopOpacity=".04"/>
            <stop offset=".42" stopColor="#69ecff" stopOpacity=".9"/>
            <stop offset="1" stopColor="#27a9ff" stopOpacity=".12"/>
          </linearGradient>
        </defs>
        <g className="connect-splash__upper-wave">
          <path d="M-80 250 C80 265 181 199 285 116 S438 43 520 -18 L520 -90 L-80 -90Z"
            fill="url(#splashUpper)"/>
          <path d="M-80 250 C80 265 181 199 285 116 S438 43 520 -18"
            fill="none" stroke="url(#splashEdge)" strokeWidth="2"/>
          <path d="M-90 305 C100 245 191 213 317 163 S450 110 520 97"
            fill="none" stroke="#48a6fe" strokeWidth="1" strokeOpacity=".27"/>
        </g>
        <g className="connect-splash__lower-wave">
          <path d="M-80 676 C79 787 153 751 260 677 S418 587 530 601 L530 990 L-80 990Z"
            fill="url(#splashLower)" opacity=".95"/>
          <path d="M-80 676 C79 787 153 751 260 677 S418 587 530 601"
            fill="none" stroke="url(#splashEdge)" strokeWidth="2.4"/>
          <path d="M-100 754 C87 823 169 767 264 717 S436 687 540 651"
            fill="none" stroke="#41aaff" strokeOpacity=".6" strokeWidth="2"/>
          <path d="M-100 809 C75 883 193 794 300 763 S424 738 536 722"
            fill="none" stroke="#288afe" strokeOpacity=".25" strokeWidth="1"/>
        </g>
      </svg>
      <div className="connect-splash__center">
        <svg className="connect-splash__icon" viewBox="0 0 300 300" aria-hidden="true">
          <defs>
            <linearGradient id="connectSplashBlue" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#059fff"/>
              <stop offset=".53" stopColor="#0075fb"/>
              <stop offset="1" stopColor="#004cf2"/>
            </linearGradient>
            <linearGradient id="connectSplashWhite" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffffff"/>
              <stop offset="1" stopColor="#e7edff"/>
            </linearGradient>
            <filter id="connectSplashShadow" x="-30%" y="-30%" width="160%" height="170%">
              <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#002b94" floodOpacity=".28"/>
            </filter>
          </defs>
          <rect width="300" height="300" rx="70" fill="url(#connectSplashBlue)"/>
          <g>
            {/* Back bubble first: left and below, with a distinct silhouette. */}
            <path d="M116 94 C77 94 49 120 49 152 C49 171 59 185 76 194
              L68 210 Q66 216 73 213 L94 200 Q107 205 121 205
              C159 205 184 182 184 151 C184 118 156 94 116 94Z"
              fill="#e9f0ff" filter="url(#connectSplashShadow)"/>
            {/* Front bubble is smaller and higher, with its own shadow to keep the overlap legible. */}
            <path d="M183 53 C141 53 110 78 110 113 C110 147 141 171 183 171
              Q201 171 212 165 L226 176 Q235 181 233 170 L230 151
              C242 140 249 127 249 112 C249 79 221 53 183 53Z"
              fill="url(#connectSplashWhite)" stroke="#bfd2f3" strokeWidth="2.8"
              filter="url(#connectSplashShadow)"/>
            <circle cx="145" cy="113" r="9" fill="#0566ec"/>
            <circle cx="179" cy="113" r="9" fill="#0566ec"/>
            <circle cx="213" cy="113" r="9" fill="#0566ec"/>
          </g>
        </svg>
        <div className="connect-splash__word" aria-hidden="true">
          {BRAND.map((character, index) => (
            <span key={index}
              className={'connect-splash__letter' + (index < letters ? ' is-visible' : '')}>
              {character}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
