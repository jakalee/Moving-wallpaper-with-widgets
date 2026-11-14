// 데모 GIF용 프레임 촬영: node scripts/record-demo.mjs <출력폴더>
// (puppeteer-core + 설치된 Google Chrome 사용, 샘플 데이터 ?demo=1)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const out = process.argv[2] || 'frames';
fs.mkdirSync(out, { recursive: true });
const scenes = [
  'weather=partly&hour=13&month=10',
  'weather=partly&hour=17.92&month=10',
  'weather=clear&hour=22.5',
  'weather=rain&hour=21',
  'weather=snow&hour=10&month=12',
  'weather=storm&hour=20.5'
];
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540, deviceScaleFactor: 1 });
let n = 0;
for (const s of scenes) {
  await page.goto(`http://localhost:8777/?demo=1&${s}`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2500));
  for (let i = 0; i < 28; i++) {
    await page.screenshot({ path: `${out}/f${String(n++).padStart(4, '0')}.png` });
    await new Promise(r => setTimeout(r, 70));
  }
  console.log('scene', s, 'done');
}
await browser.close();
