import { useCallback, useEffect, useRef, useState } from 'react';
import soundUrl from '../assets/gasp-ui-notification-4.wav';

const STORAGE_KEY = 'space-bar-order-sound';

export function useOrderSound() {
  const [soundState, setSoundState] = useState(() =>
    localStorage.getItem(STORAGE_KEY) === 'off' ? 'off' : 'on',
  );
  const muted = useRef(soundState === 'off');
  const audio = useRef(null);

  useEffect(() => {
    const player = new Audio(soundUrl);
    player.preload = 'auto';
    audio.current = player;
    return () => player.pause();
  }, []);

  const notify = useCallback(async () => {
    if (muted.current || !audio.current) return;
    try {
      audio.current.currentTime = 0;
      await audio.current.play();
      if (!muted.current) setSoundState('on');
    } catch {
      if (!muted.current) setSoundState('blocked');
    }
  }, []);

  function toggleSound() {
    muted.current = soundState === 'on';
    localStorage.setItem(STORAGE_KEY, muted.current ? 'off' : 'on');
    if (muted.current) {
      audio.current?.pause();
      setSoundState('off');
    } else {
      notify();
    }
  }

  return { notify, toggleSound, soundState };
}
