// Only installed into our own origin. No login tokens cross this bridge.
export function bridgeScript(origin: string): string {
  return `(() => {
    if (location.origin !== ${JSON.stringify(origin)} || window.__mreyesBridgeInstalled) return;
    window.__mreyesBridgeInstalled = true;
    window.__MREYES_NATIVE__ = { version: 1 };
    const send = payload => window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    const shareBlob = async (url, name) => {
      try {
        const blob = await (await fetch(url)).blob();
        if (blob.size > 15 * 1024 * 1024) throw new Error('15MB 이하의 파일만 앱에서 공유할 수 있습니다.');
        const reader = new FileReader();
        reader.onload = () => send({type:'share-file',mime:blob.type,base64:String(reader.result).split(',')[1],name:name || 'MReyes'});
        reader.onerror = () => send({type:'file-error'});
        reader.readAsDataURL(blob);
      } catch { send({type:'file-error'}); }
    };
    document.addEventListener('click', event => {
      if (event.defaultPrevented) return;
      const anchor = event.target.closest?.('a');
      if (anchor?.href.startsWith('blob:') && (anchor.target === '_blank' || anchor.hasAttribute('download'))) {
        event.preventDefault(); shareBlob(anchor.href, anchor.download);
      }
    });
    const originalOpen = window.open.bind(window);
    window.open = (url, ...args) => {
      if (typeof url === 'string' && url.startsWith('blob:')) { shareBlob(url); return null; }
      return originalOpen(url, ...args);
    };
    window.dispatchEvent(new Event('mreyes:native-ready'));
  })(); true;`;
}

export const RESUME_SCRIPT = `window.dispatchEvent(new Event('mreyes:native-resume')); true;`;
