// 메일 비밀번호(앱 비밀번호)를 macOS 키체인에 저장합니다. 비밀번호는 화면에 표시되지 않습니다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const file = ['../config.json', '../config.example.json'].map(f => new URL(f, import.meta.url)).find(u => fs.existsSync(u));
const { mail } = JSON.parse(fs.readFileSync(file, 'utf8'));
console.log(`키체인 항목 "${mail.keychainService}" / 계정 ${mail.user}`);
console.log('메일 비밀번호(또는 앱 비밀번호)를 두 번 입력하세요.');
const r = spawnSync('security', ['add-generic-password', '-U', '-s', mail.keychainService, '-a', mail.user, '-l', 'Plash Desk Mail', '-w'], { stdio: 'inherit' });
console.log(r.status === 0 ? '✅ 저장 완료. 서버가 다음 확인 때(최대 3분) 메일을 불러옵니다.' : '❌ 저장 실패');
