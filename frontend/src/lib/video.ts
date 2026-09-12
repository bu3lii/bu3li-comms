/** Reads a video file's duration client-side (via a detached <video> element) before upload. */
export function readVideoDurationMs(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";

    function cleanup() {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
    }

    video.onloadedmetadata = () => {
      const durationMs = video.duration * 1000;
      cleanup();
      resolve(durationMs);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("could not read video metadata"));
    };

    video.src = url;
  });
}
