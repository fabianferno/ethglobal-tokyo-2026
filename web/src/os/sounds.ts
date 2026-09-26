"use client";

/** OS system sounds. Best-effort: browsers may block playback before a user gesture, which we ignore. */
const SOUNDS = {
  startup: "/sounds/xp_startup.mp3",
  notify: "/sounds/windows_98_notify.mp3",
} as const;

export function playSound(name: keyof typeof SOUNDS) {
  if (typeof window === "undefined") return;
  try {
    const a = new Audio(SOUNDS[name]);
    a.volume = 0.6;
    void a.play().catch(() => {});
  } catch {
    /* no audio support */
  }
}
