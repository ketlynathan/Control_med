const MISSING = Symbol('missing');

function clone(value) {
  return value === MISSING ? MISSING : JSON.parse(JSON.stringify(value));
}

function equal(left, right) {
  if (left === MISSING || right === MISSING) return left === right;
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIdList(value) {
  return Array.isArray(value) && value.every(item => isRecord(item) && item.id != null && item.id !== '');
}

function mergeValue(base, local, remote, path, conflicts) {
  if (equal(local, remote)) return clone(local);
  if (equal(local, base)) return clone(remote);
  if (equal(remote, base)) return clone(local);

  if ([base, local, remote].every(value => value === MISSING || isRecord(value))) {
    const keys = new Set([
      ...Object.keys(base === MISSING ? {} : base),
      ...Object.keys(local === MISSING ? {} : local),
      ...Object.keys(remote === MISSING ? {} : remote),
    ]);
    const output = {};
    for (const key of keys) {
      const merged = mergeValue(
        base === MISSING || !(key in base) ? MISSING : base[key],
        local === MISSING || !(key in local) ? MISSING : local[key],
        remote === MISSING || !(key in remote) ? MISSING : remote[key],
        path ? `${path}.${key}` : key,
        conflicts,
      );
      if (merged !== MISSING) output[key] = merged;
    }
    return output;
  }

  if ([base, local, remote].every(value => value === MISSING || isIdList(value))) {
    const baseRows = new Map((base === MISSING ? [] : base).map(row => [String(row.id), row]));
    const localRows = new Map((local === MISSING ? [] : local).map(row => [String(row.id), row]));
    const remoteRows = new Map((remote === MISSING ? [] : remote).map(row => [String(row.id), row]));
    const ids = [...new Set([...remoteRows.keys(), ...localRows.keys(), ...baseRows.keys()])];
    const output = [];
    for (const id of ids) {
      const baseRow = baseRows.has(id) ? baseRows.get(id) : MISSING;
      const localRow = localRows.has(id) ? localRows.get(id) : MISSING;
      const remoteRow = remoteRows.has(id) ? remoteRows.get(id) : MISSING;
      const rowPath = `${path}[${id}]`;
      if (localRow === MISSING && remoteRow !== MISSING && baseRow !== MISSING) {
        if (equal(remoteRow, baseRow)) continue;
        conflicts.push(rowPath);
        output.push(clone(remoteRow));
        continue;
      }
      if (remoteRow === MISSING && localRow !== MISSING && baseRow !== MISSING) {
        if (equal(localRow, baseRow)) continue;
        conflicts.push(rowPath);
        continue;
      }
      const merged = mergeValue(baseRow, localRow, remoteRow, rowPath, conflicts);
      if (merged !== MISSING) output.push(merged);
    }
    return output;
  }

  conflicts.push(path || '$');
  return clone(remote);
}

export function mergeBusinessState(baseState, localState, remoteState) {
  const conflicts = [];
  const state = mergeValue(baseState, localState, remoteState, '', conflicts);
  return { state, conflicts };
}

export function statesEqual(left, right) {
  return equal(left, right);
}