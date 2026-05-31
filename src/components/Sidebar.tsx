import { motion } from "motion/react";
import { Activity, CalendarClock, Moon, Save, Sun } from "lucide-react";
import type { SavedQuestion, Schedule, Thread } from "../../shared/types";

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25 }
};

export function Sidebar({
  threads,
  currentThreadId,
  savedQuestions,
  schedules,
  darkMode,
  onSelectThread,
  onRunSaved,
  onSchedule,
  onToggleDarkMode
}: {
  threads: Thread[];
  currentThreadId: string | undefined;
  savedQuestions: SavedQuestion[];
  schedules: Schedule[];
  darkMode: boolean;
  onSelectThread: (id: string) => void;
  onRunSaved: (prompt: string) => void;
  onSchedule: () => void;
  onToggleDarkMode: () => void;
}) {
  return (
    <aside className="sidebar" aria-label="Workspace">
      <div className="brand">
        <div className="brand-mark">
          <span>AQ</span>
        </div>
        <div className="brand-text">
          <h1>AnyQuery</h1>
          <p>Coral data assistant</p>
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleDarkMode}
          title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle dark mode"
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      <motion.section className="panel compact" {...fadeUp}>
        <div className="panel-title">
          <Activity size={16} />
          <span>Threads</span>
        </div>
        <div className="thread-list">
          {threads.length === 0 ? <span className="muted">No threads yet</span> : null}
          {threads.slice(0, 6).map((thread) => (
            <motion.button
              className={thread.id === currentThreadId ? "thread active" : "thread"}
              key={thread.id}
              onClick={() => onSelectThread(thread.id)}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.98 }}
            >
              <span>{thread.title}</span>
              <small>{thread.messages.length} messages</small>
            </motion.button>
          ))}
        </div>
      </motion.section>

      <motion.section className="panel compact" {...fadeUp} transition={{ delay: 0.05, duration: 0.25 }}>
        <div className="panel-title">
          <Save size={16} />
          <span>Saved</span>
        </div>
        {savedQuestions.slice(0, 4).map((saved) => (
          <motion.button
            className="saved-item"
            key={saved.id}
            onClick={() => onRunSaved(saved.prompt)}
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.98 }}
          >
            {saved.title}
          </motion.button>
        ))}
      </motion.section>

      <motion.section className="panel compact" {...fadeUp} transition={{ delay: 0.1, duration: 0.25 }}>
        <div className="panel-title">
          <CalendarClock size={16} />
          <span>Reports</span>
        </div>
        {schedules.slice(0, 3).map((schedule) => (
          <div className="report-item" key={schedule.id}>
            <strong>{schedule.frequency}</strong>
            <span>{schedule.destination}</span>
          </div>
        ))}
        <button className="secondary-button" onClick={onSchedule}>
          Add weekly
        </button>
      </motion.section>
    </aside>
  );
}
