'use strict';

function shouldReportProcessExit(session, activeSession) {
  return Boolean(session && activeSession === session && !session.stopRequested);
}

function waitForChildExit(child, timeoutMs) {
  return new Promise((resolve) => {
    let timer = null;
    let settled = false;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      child.off('exit', onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);

    child.once('exit', onExit);
    if (child.exitCode !== null || child.signalCode !== null) {
      finish(true);
      return;
    }
    timer = setTimeout(() => finish(false), Math.max(0, Number(timeoutMs) || 0));
  });
}

module.exports = { shouldReportProcessExit, waitForChildExit };
