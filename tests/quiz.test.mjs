// node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, TEAM_NOS } from '../js/data.js';
import { deriveLive, emptyState, questionStart } from '../js/quiz/state.js';
import { rank, realAnswers, tally } from '../js/score.js';

const SECRET_KEYS = ['answer', 'explanation', 'ranking'];
const RANK = [{ teamNo: 3, correct: 1, totalMs: 900, rank: 1 }];

// 문제 하나를 진행 순서대로 밟는 state 목록
function walk(index) {
  const base = { ...emptyState(), phase: 'quiz', ...questionStart(index, QUESTIONS) };
  const steps = [];
  if (base.showGrid) steps.push(['grid', { ...base }]);
  steps.push(['ready',    { ...base, showGrid: false }]);
  steps.push(['open',     { ...base, showGrid: false, open: true, openedAt: 1000 }]);
  steps.push(['closed',   { ...base, showGrid: false, open: false, openedAt: 1000 }]);
  steps.push(['revealed', { ...base, showGrid: false, open: false, openedAt: 1000, revealed: true }]);
  return steps;
}

test('정답·해설은 revealed 전에는 키 자체가 없다 (모든 문제 × 모든 단계)', () => {
  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    for (const [stage, state] of walk(i)) {
      // 호스트는 늘 순위를 넘기지만, 정답 공개 전에는 실리면 안 된다
      const live = deriveLive(state, QUESTIONS, RANK);
      assert.equal(live.stage, stage, `${q.id} ${stage}`);
      const json = JSON.stringify(live);
      if (stage === 'revealed') {
        assert.equal(live.answer, q.answer);
        assert.equal(live.explanation, q.explanation);
        assert.deepEqual(live.ranking, [{ teamNo: 3, correct: 1, rank: 1 }]);   // 시간은 폰에 안 보낸다
      } else {
        for (const k of SECRET_KEYS) assert.ok(!(k in live), `${q.id} ${stage}: '${k}' 키가 있으면 안 됨`);
        assert.ok(!json.includes(q.explanation), `${q.id} ${stage}: 해설 문구가 새면 안 됨`);
      }
    }
  }
});

test('보기는 답안을 연 뒤에만, 격자는 격자 단계에서만 실린다', () => {
  const q3 = QUESTIONS.findIndex(q => q.showBefore);
  for (const [stage, state] of walk(q3)) {
    const live = deriveLive(state, QUESTIONS);
    assert.equal('grid' in live, stage === 'grid', `grid @${stage}`);
    assert.equal('question' in live, stage !== 'grid', `question @${stage}`);
    assert.equal('choices' in live, ['open', 'closed', 'revealed'].includes(stage), `choices @${stage}`);
  }
});

test('호스트 전용 필드(openedAt, asked, index)는 live에 없다', () => {
  const live = deriveLive({ ...emptyState(), phase: 'quiz', open: true, openedAt: 123, asked: ['q1'] }, QUESTIONS);
  for (const k of ['openedAt', 'asked', 'index', 'showGrid']) assert.ok(!(k in live), k);
});

test('lobby / final', () => {
  assert.deepEqual(deriveLive(emptyState(), QUESTIONS), { phase: 'lobby' });
  assert.deepEqual(deriveLive(null, QUESTIONS), { phase: 'lobby' });
  const live = deriveLive({ phase: 'final' }, QUESTIONS, [{ teamNo: 3, correct: 5, totalMs: 999, rank: 1 }]);
  assert.deepEqual(live, { phase: 'final', total: QUESTIONS.length, ranking: [{ teamNo: 3, correct: 5, rank: 1 }] });
});

test('realAnswers: 리셋 뒤 남은 메타데이터는 답으로 세지 않는다', () => {
  const doc = { updatedAt: 5, 3: { choice: 1, ms: 10 }, 4: { ms: 3 }, 5: { choice: '1' }, x7: { choice: 0 } };
  assert.deepEqual(realAnswers(doc).map(([k]) => k), ['3']);
  assert.deepEqual(realAnswers({ updatedAt: 1 }), []);
  assert.deepEqual(tally({ 1: { choice: 0 }, 2: { choice: 2 }, 3: { choice: 2 }, meta: {} }, 4), [1, 0, 2, 0]);
});

test('rank: 정답 수 → 시간 짧은 순, 공개한 문제만 채점', () => {
  const answers = {
    q1: { 1: { choice: 1, ms: 5000 }, 2: { choice: 1, ms: 3000 }, 3: { choice: 0, ms: 100 } },
    q2: { 1: { choice: 2, ms: 1000 }, 2: { choice: 0, ms: 1000 }, 3: { choice: 2, ms: 9000 } },
    q4: { 3: { choice: 1, ms: 1 } }
  };
  const r = rank(QUESTIONS, answers, [1, 2, 3, 4], ['q1', 'q2']);
  assert.deepEqual(r.map(x => [x.teamNo, x.correct, x.totalMs, x.rank]), [
    [1, 2, 6000, 1],
    [2, 1, 3000, 2],
    [3, 1, 9000, 3],   // q4는 공개 전이라 채점 안 함
    [4, 0, 0, 4]
  ]);
  // 모두 0점이면 공동 순위
  assert.deepEqual(rank(QUESTIONS, {}, TEAM_NOS).map(x => x.rank), Array(10).fill(1));
});
