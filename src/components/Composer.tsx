import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { parseQuickInput } from '../../shared/parse';
import { api } from '../lib/api';

/**
 * The field stays the single source of truth, so the structured result is
 * written back as text the parser can read again. The due date has to come
 * back as a literal date token, or enhancing a memo would quietly drop it.
 */
export function rebuildInput(result: {
  title: string;
  tags: string[];
  priority: 0 | 1 | 2;
  dueAt: string | null;
}): string {
  const parts: string[] = [result.title];

  if (result.dueAt) {
    const due = new Date(result.dueAt);
    if (!Number.isNaN(due.getTime())) {
      parts.push(`${due.getMonth() + 1}/${due.getDate()}`);
      if (due.getHours() !== 9 || due.getMinutes() !== 0) {
        parts.push(
          `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`,
        );
      }
    }
  }

  parts.push(...result.tags.map((tag) => `#${tag}`));
  if (result.priority === 2) parts.push('!!');
  else if (result.priority === 1) parts.push('!');

  return parts.filter(Boolean).join(' ');
}

interface Props {
  /** Returns true when the memo was accepted, so the field can clear. */
  onCapture: (raw: string) => boolean;
  onFirstKeystroke: () => void;
  onNotice: (message: string) => void;
}

export function Composer({ onCapture, onFirstKeystroke, onNotice }: Props) {
  const [value, setValue] = useState('');
  const [thinking, setThinking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const announced = useRef(false);

  // Focus on mount, before anything has finished loading: the whole point is
  // that the caret is already in the field when the app paints.
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const parsed = useMemo(() => (value.trim() ? parseQuickInput(value) : null), [value]);

  const submit = () => {
    if (!value.trim()) return;
    if (onCapture(value)) {
      setValue('');
      inputRef.current?.focus({ preventScroll: true });
    }
  };

  const enhance = async () => {
    const text = value.trim();
    if (!text || thinking) return;
    setThinking(true);
    try {
      // Send our own parse: it resolved any relative date against the
      // browser's calendar, which is the one the user lives in.
      const result = await api.structure(text, parseQuickInput(text));
      setValue(rebuildInput(result));
      onNotice(result.source === 'ai' ? 'Workers AI で整形' : 'ローカル解析で整形');
      inputRef.current?.focus({ preventScroll: true });
    } catch {
      onNotice('AI に接続できません');
    } finally {
      setThinking(false);
    }
  };

  return (
    <motion.section
      className="composer glass glass--chrome glass--refract glass--live"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32, delay: 0.04 }}
    >
      <div className="composer__row">
        <input
          ref={inputRef}
          className="composer__input"
          value={value}
          enterKeyHint="done"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="メモ"
          placeholder="メモ"
          data-testid="composer-input"
          onChange={(event) => {
            setValue(event.target.value);
            if (!announced.current) {
              announced.current = true;
              onFirstKeystroke();
            }
          }}
          onKeyDown={(event) => {
            // nativeEvent.isComposing keeps Enter from committing mid-IME.
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
            if (event.key === 'Escape') setValue('');
          }}
        />

        <button
          type="button"
          className="icon-btn"
          aria-label="AI で整形"
          data-active={String(thinking)}
          disabled={!value.trim() || thinking}
          onClick={() => void enhance()}
          data-testid="composer-ai"
        >
          <motion.span
            animate={thinking ? { rotate: 360, opacity: 0.9 } : { rotate: 0, opacity: 1 }}
            transition={
              thinking
                ? { repeat: Infinity, duration: 1.1, ease: 'linear' }
                : { type: 'spring', stiffness: 300, damping: 24 }
            }
            style={{ display: 'grid', placeItems: 'center' }}
          >
            ✦
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {value.trim() && (
            <motion.button
              type="button"
              className="icon-btn"
              aria-label="追加"
              onClick={submit}
              data-testid="composer-submit"
              initial={{ opacity: 0, scale: 0.6, width: 0 }}
              animate={{ opacity: 1, scale: 1, width: 44 }}
              exit={{ opacity: 0, scale: 0.6, width: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            >
              ↵
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence initial={false}>
        {parsed && parsed.hints.length > 0 && (
          <motion.div
            className="composer__hints"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            data-testid="composer-hints"
          >
            {parsed.hints.map((hint) => (
              <motion.span
                className="hint"
                key={hint}
                layout
                initial={{ opacity: 0, y: 4, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 520, damping: 30 }}
              >
                {hint}
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
