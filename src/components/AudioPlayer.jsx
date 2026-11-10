import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Mic, Headphones, Download } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { duration as fmtDur, hashString } from '../lib/format.js';

const BARS = 46;
const SPEEDS = [1, 1.5, 2];

/** Player no formato de mensagem de voz do WhatsApp. */
export default function AudioPlayer({ src, knownDuration, mine, voice = true, avatarSrc, played, title }) {
  const audio = useRef(null);
  const track = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(knownDuration || 0);
  const [speed, setSpeed] = useState(1);
  const [heard, setHeard] = useState(false);
  const [error, setError] = useState(false);

  // forma de onda determinística (o arquivo não precisa ser decodificado)
  const bars = useMemo(() => {
    let h = hashString(src || title || 'x');
    return Array.from({ length: BARS }, (_, i) => {
      h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
      const env = 0.55 + 0.45 * Math.sin((i / BARS) * Math.PI);
      return Math.max(0.12, ((h % 1000) / 1000) * env);
    });
  }, [src, title]);

  useEffect(() => {
    const stop = (e) => {
      if (e.detail !== audio.current && audio.current && !audio.current.paused) audio.current.pause();
    };
    window.addEventListener('wa-audio-play', stop);
    return () => window.removeEventListener('wa-audio-play', stop);
  }, []);

  const toggle = async () => {
    const a = audio.current;
    if (!a || error) return;
    if (a.paused) {
      window.dispatchEvent(new CustomEvent('wa-audio-play', { detail: a }));
      try {
        await a.play();
      } catch {
        setError(true);
      }
    } else a.pause();
  };

  const seek = (clientX) => {
    const a = audio.current;
    const el = track.current;
    if (!a || !el) return;
    const r = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const d = isFinite(a.duration) && a.duration ? a.duration : total;
    if (!d) return;
    a.currentTime = f * d;
    setCurrent(a.currentTime);
  };

  const onPointerDown = (e) => {
    e.stopPropagation();
    seek(e.clientX);
    const move = (ev) => seek(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const cycleSpeed = (e) => {
    e.stopPropagation();
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audio.current) audio.current.playbackRate = next;
  };

  const progress = total ? Math.min(1, current / total) : 0;
  const unavailable = !src || error;
  const micColor = played || heard || mine ? 'text-check' : 'text-wa';

  const side = (
    <div className="relative shrink-0">
      {playing || (current > 0 && !unavailable) ? (
        <button onClick={cycleSpeed} className="flex h-[55px] w-[55px] items-center justify-center" title="Velocidade de reprodução">
          <span className="rounded-full bg-[var(--wave-active)] px-2.5 py-0.5 text-[13px] font-semibold text-[var(--panel)]">{speed}×</span>
        </button>
      ) : voice ? (
        <>
          <Avatar src={avatarSrc} size={55} />
          <Mic size={19} strokeWidth={2.6} className={`absolute bottom-0 ${mine ? '-left-1' : '-right-1'} ${micColor}`} fill="currentColor" />
        </>
      ) : (
        <div className="flex h-[55px] w-[55px] items-center justify-center rounded-full bg-[#ff9a3d] text-white">
          <Headphones size={26} />
        </div>
      )}
    </div>
  );

  return (
    <div className="flex w-[300px] max-w-full items-center gap-2 py-1 select-none" onClick={(e) => e.stopPropagation()}>
      {!mine && side}
      <button
        onClick={toggle}
        disabled={unavailable}
        title={unavailable ? 'Arquivo de áudio indisponível neste backup' : playing ? 'Pausar' : 'Reproduzir'}
        className="flex h-9 w-9 shrink-0 items-center justify-center text-[var(--wave-active)] disabled:opacity-60"
      >
        {unavailable ? <Download size={22} /> : playing ? <Pause size={26} fill="currentColor" strokeWidth={0} /> : <Play size={26} fill="currentColor" strokeWidth={0} />}
      </button>
      <div className="min-w-0 flex-1">
        <div ref={track} onPointerDown={unavailable ? undefined : onPointerDown} className="relative flex h-[26px] cursor-pointer items-center gap-[2px]">
          {bars.map((b, i) => {
            const on = (i + 0.5) / BARS <= progress;
            return (
              <span
                key={i}
                className="flex-1 rounded-full"
                style={{ height: `${Math.round(b * 24) + 2}px`, background: on ? (mine ? 'var(--check)' : 'var(--dot)') : mine ? 'var(--wave-out)' : 'var(--wave)' }}
              />
            );
          })}
          <span
            className="pointer-events-none absolute top-1/2 h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: `${progress * 100}%`, background: played || heard || mine ? 'var(--check)' : 'var(--dot)' }}
          />
        </div>
        <div className="mt-0.5 text-[11px] text-meta">{unavailable && !total ? 'Indisponível' : fmtDur(playing || current ? current : total)}</div>
      </div>
      {mine && side}
      {src && (
        <audio
          ref={audio}
          src={src}
          preload="metadata"
          onLoadedMetadata={(e) => isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0 && setTotal(e.currentTarget.duration)}
          onDurationChange={(e) => isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0 && setTotal(e.currentTarget.duration)}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onPlay={() => {
            setPlaying(true);
            setHeard(true);
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setCurrent(0);
          }}
          onError={() => setError(true)}
        />
      )}
    </div>
  );
}
