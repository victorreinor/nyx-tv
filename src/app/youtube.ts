// Trailer: abre o app do YouTube da TV no vídeo. No Mac, abre o site.
// Samsung: app do YouTube = 111299001912, vídeo passado em PAYLOAD { values: "v=ID" }.
export function openYouTube(videoId: string): Promise<boolean> {
  const tz = (window as any).tizen;
  if (!tz || !tz.application || !tz.ApplicationControl) {
    window.open('https://www.youtube.com/watch?v=' + encodeURIComponent(videoId), '_blank');
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    try {
      const data = new tz.ApplicationControlData('PAYLOAD', [JSON.stringify({ values: 'v=' + videoId })]);
      const ctrl = new tz.ApplicationControl('http://tizen.org/appcontrol/operation/view', null, null, null, [data]);
      tz.application.launchAppControl(ctrl, '111299001912', () => resolve(true), () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}
