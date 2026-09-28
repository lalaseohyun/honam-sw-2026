// 내보내기용 순수 함수 — DOM·백엔드 없음 (tests/export.test.mjs)

import { TEAMS, TEAM_NOS, STAGES, QUESTIONS } from './data.js';
import { rank } from './score.js';

const pad = n => String(n).padStart(2, '0');
export const fmtTime = t => {
  if (!t) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const cell = v => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다
export const toCsv = rows => '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');

// 조 하나가 한 줄 — 단계별로 제출시각·항목·사진 수(또는 PDF) 열이 붙는다
export function progressRows(priv) {
  const head = ['조', '팀원'];
  for (const s of STAGES) {
    head.push(`${s.name} 제출시각`, ...s.fields.map(f => `${s.name}-${f.label}`));
    if (s.photo) head.push(`${s.name} 사진 수`);
    if (s.pdf) head.push(`${s.name} PDF 파일명`, `${s.name} PDF 주소`);
  }
  const rows = [head];
  for (const n of TEAM_NOS) {
    const row = [`${n}조`, TEAMS[n].members.join(' / ')];
    for (const s of STAGES) {
      const v = priv?.[n]?.[s.id];
      row.push(fmtTime(v?.submittedAt), ...s.fields.map(f => v?.fields?.[f.key] ?? ''));
      if (s.photo) row.push(v ? (v.photos || []).length : '');
      if (s.pdf) row.push(v?.pdfName || '', v?.pdfUrl || '');
    }
    rows.push(row);
  }
  return rows;
}

export function quizRows(answers, asked) {
  const scored = asked?.length ? asked : QUESTIONS.map(q => q.id);
  const qs = QUESTIONS.filter(q => scored.includes(q.id));
  const head = ['순위', '조', '정답 수', '정답 시간 합(초)', ...qs.map(q => `${q.no}번 선택`)];
  const rows = [head];
  for (const r of rank(QUESTIONS, answers, TEAM_NOS, scored)) {
    rows.push([r.rank, `${r.teamNo}조`, r.correct, (r.totalMs / 1000).toFixed(1),
      ...qs.map(q => {
        const a = answers?.[q.id]?.[r.teamNo];
        return typeof a?.choice === 'number' ? `${a.choice + 1}${a.choice === q.answer ? ' ○' : ' ×'}` : '';
      })]);
  }
  return rows;
}

// 제출 건수 — public(현황판)과 private(원본)을 따로 세어 서로 대조한다 (사양서 §8-6)
export function countSubmissions(pub, priv) {
  return STAGES.map(s => ({
    id: s.id, name: s.name,
    pub: TEAM_NOS.filter(n => pub?.[n]?.[s.id]?.submittedAt).length,
    priv: TEAM_NOS.filter(n => priv?.[n]?.[s.id]?.submittedAt).length
  }));
}
