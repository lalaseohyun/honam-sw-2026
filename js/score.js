// 순수 채점 함수 — DOM 없음, 백엔드 호출 없음.
// 호스트 실시간 순위와 최종 화면이 같은 함수를 부른다.

// 답안 문서에서 진짜 답만 추린다. 제출 수·보기별 집계·체크마크 모두 이 함수를 거친다.
export const realAnswers = doc => Object.entries(doc || {})
  .filter(([k, v]) => /^\d+$/.test(k) && typeof v?.choice === 'number');

// 보기별 집계 → [n0, n1, ...]
export function tally(doc, choiceCount) {
  const counts = Array(choiceCount).fill(0);
  for (const [, v] of realAnswers(doc)) if (v.choice >= 0 && v.choice < choiceCount) counts[v.choice]++;
  return counts;
}

/**
 * @param {Array} questions  QUESTIONS
 * @param {Object} answers   /quiz/answers  { [qid]: { [teamNo]: {choice, ms} } }
 * @param {number[]} teams   채점할 조 번호
 * @param {string[]} [scoredIds]  채점할 문제 id (기본: 전부). 호스트는 정답 공개한 문제만 넘긴다
 * @returns {{teamNo, correct, totalMs, rank}[]}  정답 수 많은 순 → totalMs 짧은 순
 */
export function rank(questions, answers, teams, scoredIds) {
  const scored = questions.filter(q => !scoredIds || scoredIds.includes(q.id));
  const rows = teams.map(teamNo => {
    let correct = 0, totalMs = 0;
    for (const q of scored) {
      const a = realAnswers(answers?.[q.id]).find(([k]) => Number(k) === teamNo)?.[1];
      if (a && a.choice === q.answer) { correct++; totalMs += Math.max(0, a.ms || 0); }
    }
    return { teamNo, correct, totalMs };
  });

  rows.sort((a, b) => b.correct - a.correct || a.totalMs - b.totalMs || a.teamNo - b.teamNo);

  // 정답 수와 시간이 완전히 같을 때만 공동 순위
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && prev.correct === r.correct && prev.totalMs === r.totalMs ? prev.rank : i + 1;
  });
  return rows;
}
