function runBackgroundTasks(tasks = []) {
  const safeTasks = Array.isArray(tasks) ? tasks : [];

  return Promise.allSettled(
    safeTasks.map((task) =>
      Promise.resolve().then(() => {
        if (typeof task === 'function') {
          return task();
        }
        return task;
      })
    )
  );
}

module.exports = { runBackgroundTasks };
