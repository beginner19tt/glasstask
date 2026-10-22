import { motion } from 'framer-motion';

/** Full-screen skeleton shown while the session and task list resolve. */
export function Skeleton() {
  return (
    <motion.div
      className="skeleton"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(8px)', scale: 1.015 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      aria-hidden="true"
      data-testid="skeleton"
    >
      <div className="sk sk--topbar" />
      <div className="sk sk--composer" />
      <div className="sk sk--rail" />
      <div className="skeleton__list">
        <div className="sk sk--card" />
        <div className="sk sk--card" />
        <div className="sk sk--card" />
        <div className="sk sk--card" />
        <div className="sk sk--card" />
      </div>
    </motion.div>
  );
}
