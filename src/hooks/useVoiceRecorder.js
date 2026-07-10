import { useState, useRef, useCallback, useEffect } from 'react';

const MAX_SECONDS = 180; // 3-minute cap (matches the server's size limit)

/**
 * MediaRecorder wrapper for voice capture.
 *
 * Handles mic permission, mimeType negotiation (Chrome/Android record
 * webm/opus; iOS Safari only supports mp4/aac — Whisper accepts both),
 * a hard 3-minute auto-stop, and elapsed-time state for the UI.
 */
export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const resolveRef = useRef(null);

  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    recorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    setIsRecording(false);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setElapsed(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        resolveRef.current?.(blob);
        resolveRef.current = null;
        cleanup();
      };

      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1;
          if (next >= MAX_SECONDS && recorderRef.current?.state === 'recording') {
            recorderRef.current.stop();
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      console.error('Voice recorder error:', err);
      setError(
        err?.name === 'NotAllowedError'
          ? 'Microphone access was denied. Enable it in your browser settings and try again.'
          : 'Could not start recording on this device.'
      );
      cleanup();
    }
  }, [cleanup]);

  /** Stop recording; resolves with the audio Blob. */
  const stop = useCallback(() => new Promise((resolve) => {
    if (recorderRef.current?.state === 'recording') {
      resolveRef.current = resolve;
      recorderRef.current.stop();
    } else {
      resolve(null);
      cleanup();
    }
  }), [cleanup]);

  const cancel = useCallback(() => {
    resolveRef.current = null;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    cleanup();
  }, [cleanup]);

  return { isRecording, elapsed, error, start, stop, cancel, maxSeconds: MAX_SECONDS };
}
