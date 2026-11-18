/** Release playback owned by a session; this does not stop borrowed stream tracks. */
export function releasePlayback(media:HTMLMediaElement|null):void {
  if(!media)return;
  media.pause();media.srcObject=null;media.removeAttribute('src');media.load();
}
