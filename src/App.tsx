import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { FlickDirection, Lane } from '../shared/task';
import { countByLane, STATUS_META } from '../shared/task';
import { useStore } from './lib/store';
import { GlassFilter } from './components/GlassFilter';
import { Skeleton } from './components/Skeleton';
import { Composer } from './components/Composer';
import { LaneRail } from './components/LaneRail';
import { TaskCard } from './components/TaskCard';
import { AccountSheet } from './components/AccountSheet';
import { Toasts, type Toast } from './components/Toasts';

/** Minimum time the skeleton stays up, so a fast load still reads as a load. */
const SKELETON_FLOOR_MS = 420;

export default function App() {
  const { state, capture, flick, remove, signOut, reload } = useStore();
  const [lane, setLane] = useState<Lane>('inbox');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [floorPassed, setFloorPassed] = useState(false);
  const [skeletonDismissed, setSkeletonDismissed] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setFloorPassed(true), SKELETON_FLOOR_MS);
    return () => clearTimeout(timer);
  }, []);

  const notice = useCallback((text: string, laneHint?: Lane) => {
    const id = (toastId.current += 1);
    setToasts((prev) => [
      ...prev.slice(-2),
      {
        id,
        text,
        lane: laneHint ? STATUS_META[laneHint].label : undefined,
        hue: laneHint ? STATUS_META[laneHint].hue : undefined,
      },
    ]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2000);
  }, []);

  const counts = useMemo(() => countByLane(state.tasks), [state.tasks]);
  const visible = useMemo(
    () => state.tasks.filter((task) => task.status === lane),
    [state.tasks, lane],
  );

  const showSkeleton = !skeletonDismissed && (state.phase === 'boot' || !floorPassed);

  const onCapture = (raw: string) => {
    const task = capture(raw, lane === 'archived' ? 'inbox' : lane);
    if (!task) return false;
    if (task.status !== lane) setLane(task.status);
    return true;
  };

  const onFlick = (id: string, direction: FlickDirection) => {
    const target = flick(id, direction);
    if (target) {
      notice('→', target);
      if ('vibrate' in navigator) navigator.vibrate?.(8);
    }
  };

  return (
    <>
      <GlassFilter />
      <div className="aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className="shell">
        <AnimatePresence>{showSkeleton && <Skeleton />}</AnimatePresence>

        <motion.header
          className="topbar"
          initial={{ opacity: 0 }}
          animate={{ opacity: showSkeleton ? 0 : 1 }}
          transition={{ duration: 0.32, delay: 0.06 }}
        >
          <div className="topbar__counts">
            <b data-testid="total-open">{counts.inbox + counts.today + counts.doing}</b>
            <span>/</span>
            <span data-testid="total-done">{counts.done}</span>
          </div>
          <div className="topbar__spacer" />
          {state.queue.length > 0 && (
            <span className="chip glass" data-testid="queue-chip">
              <span className="chip__dot chip__dot--off" />
              {state.queue.length}
            </span>
          )}
          {!state.online && (
            <span className="chip glass chip--ghost" data-testid="offline-chip">
              offline
            </span>
          )}
          <button
            type="button"
            className="chip glass"
            onClick={() => setSheetOpen(true)}
            aria-label="アカウント"
            data-testid="account-open"
          >
            {state.user?.picture ? (
              <img className="avatar" src={state.user.picture} alt="" />
            ) : (
              <span className="chip__dot" style={{ background: state.user ? '#34d399' : '#64748b' }} />
            )}
            {state.user ? state.user.name || 'account' : 'local'}
          </button>
        </motion.header>

        <Composer
          onCapture={onCapture}
          onFirstKeystroke={() => setSkeletonDismissed(true)}
          onNotice={notice}
        />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: showSkeleton ? 0 : 1 }}
          transition={{ duration: 0.32, delay: 0.1 }}
        >
          <LaneRail active={lane} counts={counts} onSelect={setLane} />
        </motion.div>

        <motion.ul
          className="list"
          initial={{ opacity: 0 }}
          animate={{ opacity: showSkeleton ? 0 : 1 }}
          transition={{ duration: 0.36, delay: 0.14 }}
          data-testid="task-list"
          data-lane={lane}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((task) => (
              <TaskCard key={task.id} task={task} onFlick={onFlick} onRemove={remove} />
            ))}
          </AnimatePresence>

          {visible.length === 0 && !showSkeleton && (
            <motion.li
              className="empty"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              data-testid="empty-state"
            >
              <span className="empty__glyph">{STATUS_META[lane].glyph}</span>
              <span className="empty__hint">0</span>
            </motion.li>
          )}
        </motion.ul>
      </div>

      <AccountSheet
        open={sheetOpen}
        user={state.user}
        googleConfigured={state.googleConfigured}
        devAuth={state.devAuth}
        queued={state.queue.length}
        onClose={() => setSheetOpen(false)}
        onSignedIn={() => {
          setSheetOpen(false);
          void reload();
        }}
        onSignOut={() => {
          void signOut();
          setSheetOpen(false);
        }}
        onNotice={notice}
      />

      <Toasts items={toasts} />
    </>
  );
}
