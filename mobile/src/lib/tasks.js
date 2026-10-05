const listeners = new Set();

export function isSelectableTask(task) {
  return Boolean(task) && !task.archived && !task.completed && !task.subject?.archived;
}

export function subscribeTasksChanged(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyTasksChanged(change = {}) {
  listeners.forEach((listener) => listener(change));
}
