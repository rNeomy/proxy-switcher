// dealing with managed storage
{
  const ALLOWED = new Set([
    'text',
    'counter',
    'color',
    'validate-mode',
    'faqs',
    'startup-proxy',
    'color-auto_detect',
    'color-direct',
    'color-fixed_servers',
    'color-pac_script_url',
    'color-pac_script_data',
    'color-system',
    'profiles',
    'script',
    'pacs',
    'pac-type',
    'last-pac',
    'last-manual',
    'last-update'
  ]);
  const isPlainObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);
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
            let json;
            try {
              json = JSON.parse(mps['import-json']);
            }
            catch (e) {
              console.error(e);
              run.busy = false;
              return;
            }
            if (!isPlainObject(json)) {
              console.error('[managing] import-json is not a plain object');
              run.busy = false;
              return;
            }
            const filtered = {};
            for (const [key, value] of Object.entries(json)) {
              if (ALLOWED.has(key) || key.startsWith('profile.')) {
                filtered[key] = value;
              }
              else {
                console.warn('[managing] dropping unknown key:', key);
              }
            }
            await chrome.storage.local.set({
              ...filtered,
              'import-version': mps['import-version']
            });

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
