import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Lane } from '../../shared/task';
import { LANES, STATUS_META } from '../../shared/task';

interface Props {
  active: Lane;
  counts: Record<Lane, number>;
  onSelect: (lane: Lane) => void;
}

/**
 * Five lanes plus their counts do not fit across a 375px phone, so the rail
 * scrolls. A fade on whichever edge has more content says so, instead of
 * leaving a lane looking clipped, and selecting a lane scrolls it into view.
 */
export function LaneRail({ active, counts, onSelect }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    setEdges({ start: track.scrollLeft > 2, end: track.scrollLeft < max - 2 });
  }, []);

  useEffect(() => {
    measure();
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [measure, counts]);

  useEffect(() => {
    trackRef.current
      ?.querySelector(`[data-testid="lane-${active}"]`)
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }, [active]);

  return (
    <motion.div
      className="rail glass glass--chrome"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32, delay: 0.08 }}
    >
      <div
        className="rail__track"
        ref={trackRef}
        role="tablist"
        aria-label="ステータス"
        onScroll={measure}
        data-edge-start={String(edges.start)}
        data-edge-end={String(edges.end)}
      >
        {LANES.map((lane) => (
          <button
            key={lane}
            type="button"
            role="tab"
            aria-selected={active === lane}
            className="rail__item"
            onClick={() => onSelect(lane)}
            data-testid={`lane-${lane}`}
          >
            {active === lane && (
              <motion.span
                className="rail__pill"
                layoutId="rail-pill"
                transition={{ type: 'spring', stiffness: 520, damping: 38 }}
              />
            )}
            <span>{STATUS_META[lane].label}</span>
            {/* An empty lane says so by being empty; a zero is only width. */}
            {counts[lane] > 0 && (
              <motion.span
                className="rail__count"
                key={counts[lane]}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 600, damping: 26 }}
                data-testid={`count-${lane}`}
              >
                {counts[lane]}
              </motion.span>
            )}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
