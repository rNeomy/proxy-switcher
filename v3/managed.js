// dealing with managed storage
{
  const run = async reason => {
    if (run.busy) {
      return;
    }
    run.busy = true;

    try {
      const mps = await chrome.storage.managed.get({
        'import-json': '',
        'import-version': 0
      });
      if (mps) {
        if (mps['import-json'] && mps['import-version'] > 0) {
          console.info('[managing]', reason);
          const prefs = await chrome.storage.local.get({
            'import-version': 0
          });
          if (prefs['import-version'] < mps['import-version']) {
            const json = JSON.parse(mps['import-json']);
            await chrome.storage.local.set(Object.assign({
              'import-version': mps['import-version']
            }, json));
            chrome.runtime.reload();
          }
          else {
            console.info('recent managed storage. not updating');
          }
        }
      }
    }
    catch (e) {
      console.error(e);
    }
    run.busy = false;
  };
  chrome.storage.onChanged.addListener(ps => {
    if (ps['import-version'] || ps['import-json']) {
      run('changed');
    }
  });
  const once = () => {
    if (once.done) {
      return;
    }
    once.done = true;

    run('startup');
  };
  chrome.runtime.onStartup.addListener(once);
  chrome.runtime.onInstalled.addListener(once);
}
