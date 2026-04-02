function success(data, warnings = []) {
  return { ok: true, data, warnings };
}

function fail(error, code) {
  return { ok: false, error, code };
}

function warn(message) {
  console.error(`[warn] ${message}`);
}

function printResult(result) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

module.exports = { success, fail, warn, printResult };
