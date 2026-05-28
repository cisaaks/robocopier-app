// refresh.js - runs robocopy.exe with size-safeguard pre-flight.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function nowString() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Pre-flight: walk source dir, count files + size, short-circuit at hard limit.
function scanSource(rootPath, hardFileLimit, hardSizeBytes) {
  let fileCount = 0;
  let totalSize = 0;
  let exceeded = false;

  function walk(dir) {
    if (exceeded) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const ent of entries) {
      if (exceeded) return;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile()) {
        fileCount++;
        try { totalSize += fs.statSync(full).size; } catch {}
        if (fileCount > hardFileLimit || totalSize > hardSizeBytes) {
          exceeded = true;
          return;
        }
      }
    }
  }

  try { walk(rootPath); } catch {}
  return { fileCount, totalSize, exceeded };
}

function getTaskDestination(task, config) {
  if (task.destinationOverride) return task.destinationOverride;
  return path.join(config.defaultDestinationRoot, task.name);
}

function runRobocopy(source, dest, mode) {
  return new Promise((resolve) => {
    const args = [source, dest];
    if (mode === 'replace') {
      args.push('/MIR', '/R:2', '/W:2', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/NP');
    } else {
      args.push('/E', '/R:2', '/W:2', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/NP');
    }
    const child = spawn('robocopy.exe', args, { windowsHide: true });
    child.on('exit', (code) => resolve(code));
    child.on('error', (err) => resolve({ error: err }));
  });
}

async function runTask(task, config, interactive) {
  if (!task.source) return { success: false, message: 'No source path configured' };
  if (!fs.existsSync(task.source)) {
    return { success: false, message: `Source not found or unreachable: ${task.source}` };
  }

  const warnFiles = config.warnFileCount || 200;
  const warnMB    = config.warnSizeMB || 200;
  const hardFiles = warnFiles * 10;
  const hardBytes = warnMB * 10 * 1024 * 1024;
  const warnBytes = warnMB * 1024 * 1024;

  const stats = scanSource(task.source, hardFiles, hardBytes);
  const sizeText = formatBytes(stats.totalSize);

  if (stats.exceeded) {
    return {
      success: false,
      message: `Source is too large to copy. Scanned ${stats.fileCount}+ files / ${sizeText} before hitting hard limit (>${hardFiles} files or ${warnMB * 10} MB). This tool is for individual files and small folders. To override, raise warnFileCount or warnSizeMB.`,
    };
  }

  if (stats.fileCount > warnFiles || stats.totalSize > warnBytes) {
    if (interactive) {
      // Renderer will handle the confirmation prompt before calling refresh
      // For now, we just include the warning info in the result
    }
    // We proceed - confirmation should already have been done in UI
  }

  const destBase = getTaskDestination(task, config);
  const mode = task.mode || 'replace';
  let dest;
  if (mode === 'archive') {
    dest = path.join(destBase, timestamp());
  } else {
    dest = destBase;
  }

  try {
    fs.mkdirSync(dest, { recursive: true });
  } catch (e) {
    return { success: false, message: `Could not create destination '${dest}': ${e.message}` };
  }

  const rc = await runRobocopy(task.source, dest, mode);
  if (typeof rc !== 'number') return { success: false, message: 'robocopy failed to start' };
  if (rc >= 8) return { success: false, message: `robocopy failed (exit ${rc})` };

  // Write marker
  try {
    fs.writeFileSync(
      path.join(dest, 'last-refreshed.txt'),
      `Refreshed: ${nowString()}\nSource:    ${task.source}\nMode:      ${mode}\n`,
      'utf8'
    );
  } catch {}

  task.lastRefreshed = nowString();
  task.lastSize = sizeText;
  task.lastFileCount = stats.fileCount;
  return { success: true, message: `Copied to ${dest}`, fileCount: stats.fileCount, sizeText };
}

// Renderer can call this directly to do a pre-flight check before refresh
// (e.g. to show the size warning dialog with real numbers)
function scanOnly(task, config) {
  const warnMB = config.warnSizeMB || 200;
  const hardBytes = warnMB * 10 * 1024 * 1024;
  const hardFiles = (config.warnFileCount || 200) * 10;
  if (!fs.existsSync(task.source)) return null;
  return scanSource(task.source, hardFiles, hardBytes);
}

module.exports = { runTask, scanOnly, formatBytes, getTaskDestination };
