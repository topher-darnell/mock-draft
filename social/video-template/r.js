const { chromium } = require('playwright');
const { spawn } = require('child_process');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({viewport: {width: 1080, height: 1920}});
  await p.goto('file://' + __dirname + '/jc.html'); await p.waitForTimeout(300);
  const T = 18.18, FPS = 30, N = Math.round(T * FPS);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-i', 'jcbeat.wav',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', 'bhg-daniel-jones-cut.part.mp4']);
  for (let k = 0; k < N; k++) {
    await p.evaluate(t => setT(t), k / FPS);
    const buf = await p.screenshot({type: 'jpeg', quality: 92});
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close();
})();
