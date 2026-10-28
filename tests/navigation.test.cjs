const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync('src/navigation.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exportsObject = {};
vm.runInNewContext(compiled, { exports: exportsObject, URL, URLSearchParams });
const { navigationAction, isCalendarStart, isCalendarReturn, parseSharedFile, validatedOrigin } = exportsObject;
const origin = 'https://app.pentaworks.net';
const ticketUrl = `${origin}/api/v1/integrations/google-calendar/mobile/start#ticket=${'a'.repeat(43)}`;

test('only the configured origin remains inside the authenticated WebView', () => {
  assert.equal(navigationAction(origin + '/work/12', origin), 'internal');
  assert.equal(navigationAction('https://app.pentaworks.net.evil.test/work/12', origin), 'external');
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'intent://scan', 'http://app.pentaworks.net', 'https://user:password@app.pentaworks.net/']) {
    assert.equal(navigationAction(url, origin), 'blocked', url);
  }
  assert.equal(navigationAction('https://accounts.google.com/o/oauth2/v2/auth', origin), 'blocked');
});
test('browser handoff accepts only an exact origin, path and single valid ticket', () => {
  assert.equal(isCalendarStart(ticketUrl, origin), true);
  assert.equal(navigationAction(ticketUrl, origin), 'calendar');
  for (const url of [ticketUrl.replace(origin, 'https://evil.test'), ticketUrl + '&extra=1', ticketUrl.replace('#', '?'), ticketUrl.replace('start#', 'start/evil#'), ticketUrl.replace('a'.repeat(43), 'short')]) {
    assert.equal(isCalendarStart(url, origin), false, url);
  }
});
test('deep links cannot inject navigation destinations or authentication state', () => {
  assert.equal(isCalendarReturn('mreyes://calendar/complete'), true);
  for (const url of ['mreyes://calendar/complete?token=secret', 'mreyes://evil/complete', 'mreyes://calendar/complete#https://evil.test']) assert.equal(isCalendarReturn(url), false);
});
test('shared files have a safe extension and cannot escape the cache directory', () => {
  const file = parseSharedFile({ base64: 'aGk=', mime: 'application/pdf', name: '../../secret.exe' });
  assert.equal(file.mime, 'application/pdf');
  assert.match(file.name, /^[a-zA-Z0-9_-]+\.pdf$/);
  for (const value of [{ base64: 'aGk=', mime: 'text/html' }, { base64: 'not base64', mime: 'application/pdf' }, { base64: 'a'.repeat(21 * 1024 * 1024), mime: 'application/pdf' }, null]) assert.equal(parseSharedFile(value), null);
});
test('configuration requires HTTPS and rejects credentials, query and paths', () => {
  assert.equal(validatedOrigin(origin), origin);
  for (const value of ['http://app.pentaworks.net', origin + '/settings', origin + '?token=secret', 'https://user:pass@app.pentaworks.net']) assert.throws(() => validatedOrigin(value));
});
