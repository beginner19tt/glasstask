import { useMotionValue, useTransform, motion, type PanInfo } from 'framer-motion';
import type { FlickDirection, Task } from '../../shared/task';
import { nextLane, STATUS_META } from '../../shared/task';
import { FLICK_DISTANCE, resolveFlick } from '../../shared/flick';
import { dueLabel, isOverdue } from '../lib/format';

interface Props {
  task: Task;
  onFlick: (id: string, direction: FlickDirection) => void;
  onRemove: (id: string) => void;
}

export function TaskCard({ task, onFlick, onRemove }: Props) {
  const x = useMotionValue(0);
  const bedForward = useTransform(x, [0, FLICK_DISTANCE], [0, 1]);
  const bedBack = useTransform(x, [-FLICK_DISTANCE, 0], [1, 0]);
  const tilt = useTransform(x, [-160, 0, 160], [-2.4, 0, 2.4]);
  const lift = useTransform(x, [-160, 0, 160], [0.985, 1, 0.985]);

  const forwardTarget = nextLane(task.status, 'forward');
  const backTarget = nextLane(task.status, 'back');
  const meta = STATUS_META[task.status];
  const due = dueLabel(task.dueAt);
  const overdue = isOverdue(task.dueAt) && task.status !== 'done';

  const handleDragEnd = (_event: unknown, info: PanInfo) => {
    const direction = resolveFlick(info);
    if (direction) onFlick(task.id, direction);
  };

  // A disabled end-of-chain button must not announce a move it cannot make.
  const backLabel =
    backTarget === task.status
      ? `${task.title} はこれ以上戻せません`
      : `${task.title} を ${STATUS_META[backTarget].label} へ`;
  const forwardLabel =
    forwardTarget === task.status
      ? `${task.title} はこれ以上進められません`
      : `${task.title} を ${STATUS_META[forwardTarget].label} へ`;

  const laneVars = {
    '--lane-h': String(meta.hue),
    '--bed-fwd-h': String(STATUS_META[forwardTarget].hue),
    '--bed-back-h': String(STATUS_META[backTarget].hue),
  } as React.CSSProperties;

  return (
    <motion.li
      className="row"
      style={laneVars}
      layout
      initial={{ opacity: 0, y: -14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92, filter: 'blur(6px)' }}
      transition={{ type: 'spring', stiffness: 460, damping: 34, mass: 0.7 }}
      data-testid="task-row"
      data-status={task.status}
      data-title={task.title}
    >
      <div className="row__bed" aria-hidden="true">
        <motion.span className="back" style={{ opacity: bedBack }}>
          ‹ {STATUS_META[backTarget].label}
        </motion.span>
        <motion.span className="fwd" style={{ opacity: bedForward }}>
          {STATUS_META[forwardTarget].label} ›
        </motion.span>
      </div>

      <motion.article
        className="card glass"
        style={{ x, rotate: tilt, scale: lift }}
        drag="x"
        dragDirectionLock
        dragElastic={0.26}
        dragConstraints={{ left: 0, right: 0 }}
        dragSnapToOrigin
        dragTransition={{ bounceStiffness: 620, bounceDamping: 42 }}
        whileTap={{ scale: 0.985 }}
        onDragEnd={handleDragEnd}
        data-done={String(task.status === 'done')}
      >
        <div className="card__head">
          <span className="card__mark" aria-hidden="true">
            {meta.glyph}
          </span>
          <h2 className="card__title">{task.title}</h2>
          <div className="card__actions">
            <button
              type="button"
              className="icon-btn"
              aria-label={backLabel}
              disabled={backTarget === task.status}
              onClick={() => onFlick(task.id, 'back')}
              data-testid="flick-back"
            >
              ‹
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={forwardLabel}
              disabled={forwardTarget === task.status}
              onClick={() => onFlick(task.id, 'forward')}
              data-testid="flick-forward"
            >
              ›
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`${task.title} を削除`}
              onClick={() => onRemove(task.id)}
              data-testid="task-delete"
            >
              ×
            </button>
          </div>
        </div>

        {(task.tags.length > 0 || due || task.priority > 0) && (
          <div className="card__meta">
            {task.priority > 0 && (
              <span className={`tag tag--p${task.priority}`}>
                {task.priority === 2 ? '!!' : '!'}
              </span>
            )}
            {due && <span className={`tag ${overdue ? 'tag--overdue' : 'tag--due'}`}>{due}</span>}
            {task.tags.map((tag) => (
              <span className="tag" key={tag}>
                #{tag}
              </span>
            ))}
          </div>
        )}
      </motion.article>
    </motion.li>
  );
}
