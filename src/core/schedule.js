// schedule.js - wraps schtasks.exe to create/remove Windows Task Scheduler entries.
// Each RoboCopier task gets a Task Scheduler entry named "RoboCopier_<taskname>".

const { spawnSync } = require('child_process');

function taskNameOf(name) { return `RoboCopier_${name}`; }

function summary(schedule) {
  if (!schedule || !schedule.type || schedule.type === 'none') return 'None';
  const t = schedule.time || '??:??';
  switch (schedule.type) {
    case 'daily':   return `Daily ${t}`;
    case 'weekly':  return `Weekly ${schedule.dayOfWeek || '?'} ${t}`;
    case 'monthly': return `Monthly day ${schedule.dayOfMonth || '?'} ${t}`;
    default:        return 'None';
  }
}

function remove(name) {
  try {
    spawnSync('schtasks.exe', ['/delete', '/tn', taskNameOf(name), '/f'], { windowsHide: true });
  } catch {}
}

function sync(name, schedule, app) {
  if (!schedule || !schedule.type || schedule.type === 'none') {
    remove(name);
    return { success: true, message: 'No schedule' };
  }

  // Build /tr - the command line to run. In packaged mode, the .exe is process.execPath.
  // In dev mode, fall back to electron.exe + script path.
  let trCommand;
  if (app && app.isPackaged) {
    trCommand = `"${process.execPath}" --task-cli --task-name "${name}"`;
  } else {
    // Dev mode - run via the same Electron binary with --task-cli flag
    trCommand = `"${process.execPath}" "${process.argv[1] || ''}" --task-cli --task-name "${name}"`;
  }

  const time = schedule.time || '08:00';
  const args = ['/create', '/tn', taskNameOf(name), '/st', time, '/f', '/tr', trCommand];

  switch (schedule.type) {
    case 'daily':
      args.push('/sc', 'DAILY');
      break;
    case 'weekly':
      args.push('/sc', 'WEEKLY', '/d', schedule.dayOfWeek || 'SUN');
      break;
    case 'monthly':
      args.push('/sc', 'MONTHLY', '/d', String(schedule.dayOfMonth || 1));
      break;
  }

  try {
    const r = spawnSync('schtasks.exe', args, { windowsHide: true, encoding: 'utf8' });
    if (r.status !== 0) {
      return { success: false, message: `schtasks failed: ${(r.stderr || r.stdout || '').trim()}` };
    }
    return { success: true, message: `Schedule set: ${summary(schedule)}` };
  } catch (e) {
    return { success: false, message: `Error: ${e.message}` };
  }
}

module.exports = { sync, remove, summary, taskNameOf };
