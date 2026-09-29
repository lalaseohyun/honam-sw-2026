import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv, progressRows, quizRows, countSubmissions } from '../js/export.js';

test('CSV: BOM + 쉼표·따옴표·줄바꿈 이스케이프', () => {
  const csv = toCsv([['a', 'b,c'], ['He said "hi"', '줄\n바꿈']]);
  assert.equal(csv, '﻿a,"b,c"\r\n"He said ""hi""","줄\n바꿈"');
});

test('진행 CSV: 조마다 한 줄, 빈 단계는 빈칸', () => {
  const priv = { 3: { s1: { submittedAt: 1, fields: { persona: '직장인', problem: '대기' }, photos: ['x', 'y'] },
                      s5: { submittedAt: 2, fields: { message: 'm' }, pdfName: 'a.pdf', pdfUrl: 'u' } } };
  const rows = progressRows(priv);
  assert.equal(rows.length, 11);                       // 헤더 + 10조
  const h = rows[0], r3 = rows[3];
  assert.equal(r3[0], '3조');
  assert.equal(r3[h.indexOf('문제정의-페르소나')], '직장인');
  assert.equal(r3[h.indexOf('문제정의 사진 수')], 2);
  assert.equal(r3[h.indexOf('발표자료 PDF 파일명')], 'a.pdf');
  assert.equal(r3[h.indexOf('1차 아이디어 제출시각')], '');
  assert.ok(rows.every(r => r.length === h.length));
});

test('퀴즈 CSV: 공개한 문제만, 순위순', () => {
  const answers = { q1: { 2: { choice: 1, ms: 100 }, 5: { choice: 0, ms: 50 } } };
  const rows = quizRows(answers, ['q1']);
  assert.deepEqual(rows[0], ['순위', '조', '정답 수', '정답 시간 합(초)', '1번 선택']);
  assert.deepEqual(rows[1], [1, '2조', 1, '0.1', '2 ○']);
  assert.equal(rows.find(r => r[1] === '5조')[4], '1 ×');
});

test('제출 건수: public과 private를 따로 센다', () => {
  const c = countSubmissions({ 1: { s1: { submittedAt: 1 } } }, { 1: { s1: { submittedAt: 1 } }, 2: { s1: { submittedAt: 1 } } });
  assert.deepEqual(c.find(x => x.id === 's1'), { id: 's1', name: '문제정의', pub: 1, priv: 2 });
  assert.equal(c[0].id, 's0');   // 주제·상황이 맨 앞
});
