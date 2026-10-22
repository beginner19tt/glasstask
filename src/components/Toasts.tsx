import { AnimatePresence, motion } from 'framer-motion';

export interface Toast {
  id: number;
  text: string;
  lane?: string;
  hue?: number;
}

export function Toasts({ items }: { items: Toast[] }) {
  return (
    <div className="toasts" aria-live="polite" data-testid="toasts">
      <AnimatePresence initial={false}>
        {items.map((toast) => (
          <motion.div
            key={toast.id}
            className="toast glass glass--chrome"
            style={{ ['--lane-h' as string]: String(toast.hue ?? 0) }}
            initial={{ opacity: 0, y: 18, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 520, damping: 36 }}
          >
            <span>{toast.text}</span>
            {toast.lane && <span className="toast__lane">{toast.lane}</span>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
