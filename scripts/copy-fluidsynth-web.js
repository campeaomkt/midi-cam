import fs from 'fs';
import path from 'path';

const srcDir = path.resolve('node_modules/js-synthesizer');
const publicDir = path.resolve('public/fluidsynth');
const distDir = path.resolve('dist/fluidsynth');

const filesToCopy = [
  { src: path.join(srcDir, 'externals/libfluidsynth-2.4.6.js'), name: 'libfluidsynth-2.4.6.js' },
  { src: path.join(srcDir, 'externals/libfluidsynth-2.4.6-with-libsndfile.js'), name: 'libfluidsynth-2.4.6-with-libsndfile.js' },
  { src: path.join(srcDir, 'dist/js-synthesizer.worklet.js'), name: 'js-synthesizer.worklet.js' },
  { src: path.join(srcDir, 'dist/js-synthesizer.worklet.min.js'), name: 'js-synthesizer.worklet.min.js' },
  { src: path.join(srcDir, 'dist/js-synthesizer.js'), name: 'js-synthesizer.js' },
  { src: path.join(srcDir, 'dist/js-synthesizer.min.js'), name: 'js-synthesizer.min.js' },
];

function copyFiles(targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  for (const file of filesToCopy) {
    if (fs.existsSync(file.src)) {
      fs.copyFileSync(file.src, path.join(targetDir, file.name));
    }
  }
}

copyFiles(publicDir);
if (fs.existsSync('dist')) {
  copyFiles(distDir);
}
console.log('FluidSynth web assets synchronized successfully.');
