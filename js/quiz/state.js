// quiz/state (호스트 전용, 전체 상태) → quiz/live (공개용, 좁은 뷰) 파생
//
// 순수 함수. DOM·백엔드 호출 없음. 호스트는 state를 쓸 때마다 이 함수로 live를 다시 계산해
// 같은 update()에 함께 쓴다. 참가자는 live만 구독한다.
//
// 정답(answer)·해설(explanation)은 revealed 전에는 반환 객체에 **키 자체가 없다**.
// 보기(choices)는 답안을 연 뒤에만, 기억 격자(grid)는 격자 단계에서만 실린다.

/**
 * @typedef {Object} QuizState  /quiz/state
 * @property {'lobby'|'quiz'|'final'} phase
 * @property {number}  index      현재 문제 (QUESTIONS 배열 인덱스)
 * @property {boolean} showGrid   q3처럼 showBefore.grid가 있는 문제에서 격자를 보여주는 중
 * @property {boolean} open       답안 받는 중
 * @property {boolean} revealed   정답 공개됨
 * @property {number|null} openedAt  이 문제의 답안을 처음 연 시각 (null이면 아직 안 엶)
 * @property {string[]} asked     정답까지 공개한 문제 id (채점 대상)
 */

export const emptyState = () => ({
  phase: 'lobby', index: 0, showGrid: false, open: false, revealed: false, openedAt: null, asked: []
});

// 문제 하나를 처음 상태로. q3면 격자부터 시작
export const questionStart = (index, questions) => ({
  index,
  showGrid: !!questions[index]?.showBefore?.grid,
  open: false, revealed: false, openedAt: null
});

// 참가자 화면이 보여줄 단계
export function stageOf(s) {
  if (s.revealed) return 'revealed';
  if (s.open) return 'open';
  if (s.openedAt) return 'closed';
  if (s.showGrid) return 'grid';
  return 'ready';
}

/**
 * @param {QuizState} state
 * @param {Array} questions   QUESTIONS
 * @param {Array} [ranking]   score.js rank() 결과 — 정답 공개 단계와 final 단계에서만 실린다
 */
// 폰에 보낼 순위 — 시간(totalMs)은 빼고 정답 수와 순위만
const slimRanking = ranking => (ranking || []).map(r => ({ teamNo: r.teamNo, correct: r.correct, rank: r.rank }));

export function deriveLive(state, questions, ranking) {
  const s = { ...emptyState(), ...(state || {}) };

  if (s.phase === 'final') return { phase: 'final', total: questions.length, ranking: slimRanking(ranking) };

  const q = questions[s.index];
  if (s.phase !== 'quiz' || !q) return { phase: 'lobby' };

  const stage = stageOf(s);
  const live = {
    phase: 'quiz',
    qid: q.id,
    no: q.no,
    total: questions.length,
    stage,
    open: stage === 'open',
    revealed: stage === 'revealed'
  };

  if (stage === 'grid') {
    live.grid = q.showBefore.grid;   // 격자 단계: 문제·보기 없음
    return live;
  }

  live.question = q.question;        // 격자는 여기부터 빠진다 (다시 볼 수 없음)
  if (stage !== 'ready') live.choices = q.choices;
  if (stage === 'revealed') {
    live.answer = q.answer;
    if (q.explanation) live.explanation = q.explanation;
    if (ranking) live.ranking = slimRanking(ranking);
  }
  return live;
}
