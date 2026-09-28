export const TEAMS = {
  1:{field:'지역', members:['군산 오창석','순천 김가연','전남 이민서','전북 오성배','조선 윤태건']},
  2:{field:'지역', members:['군산 장진웅','순천 박환솔','전남 박시훈','전북 정유찬','조선 여수연']},
  3:{field:'지역', members:['군산 이종서','순천 신현욱','전남 유수인','전북 조이진','조선 서정완']},
  4:{field:'관광', members:['군산 최동혁','순천 한영서','전남 박진한','전북 김지빈','조선 한고은']},
  5:{field:'관광', members:['군산 최현식','순천 신희천','전남 박주연','전북 박승주','조선 채민주']},
  6:{field:'관광', members:['군산 한승호','순천 윤지연','전남 손주하','전북 박은호','조선 박성민']},
  7:{field:'관광', members:['군산 이수인','순천 장가연','전남 임세민','전북 서종호','조선 김지환']},
  8:{field:'사회', members:['군산 박두산','순천 구단영','전남 김산하','전북 김민령','조선 김태우']},
  9:{field:'사회', members:['군산 유혜나','순천 김민서','전남 장민호','전북 이유민','조선 조민식']},
 10:{field:'사회', members:['군산 함인수','순천 이신의','전남 백은채','전북 홍채운','조선 하은서']}
};

export const TEAM_NOS = Object.keys(TEAMS).map(Number);
export const FIELD_COLORS = { '지역':'var(--f-region)', '관광':'var(--f-tour)', '사회':'var(--f-social)' };

export const UNIV_COLORS = {
  '군산':'var(--u-gunsan)', '순천':'var(--u-suncheon)', '전남':'var(--u-jeonnam)',
  '전북':'var(--u-jeonbuk)', '조선':'var(--u-chosun)'
};

// '군산 오창석' → { univ:'군산', name:'오창석' }
export const splitMember = m => {
  const [univ, ...rest] = m.split(' ');
  return { univ, name: rest.join(' ') };
};

// 진행 5단계 (사양서 §5). summary 필드가 현황판(board)에 뜬다
export const STAGES = [
  { id:'s1', name:'문제정의', photo:true, summary:'persona', fields:[
    { key:'persona', label:'페르소나', hint:'누가 가장 불편한가요? (나이·상황·특징)' },
    { key:'problem', label:'문제', hint:'언제, 어떤 상황에서, 무엇 때문에 불편한가요?', long:true } ] },
  { id:'s2', name:'1차 아이디어', summary:'name', fields:[
    { key:'name',     label:'아이디어 이름' },
    { key:'target',   label:'대상 고객' },
    { key:'problem',  label:'해결할 문제', long:true },
    { key:'solution', label:'해결 방법', long:true },
    { key:'diff',     label:'차별점', long:true } ] },
  { id:'s3', name:'서비스 구조', photo:true, summary:'feature1', fields:[
    { key:'feature1', label:'핵심 기능 1', long:true },
    { key:'feature2', label:'핵심 기능 2', long:true },
    { key:'feature3', label:'핵심 기능 3', long:true } ] },
  { id:'s4', name:'사업화 전략', photo:true, summary:'revenue', fields:[
    { key:'revenue',  label:'수익 모델', hint:'누가, 무엇에, 얼마를 내나요?', long:true },
    { key:'customer', label:'고객 확보 방법', long:true } ] },
  { id:'s5', name:'발표자료', pdf:true, fields:[
    { key:'message', label:'발표 핵심 메시지', hint:'심사위원이 기억했으면 하는 한 문장', long:true } ] }
];

// 문제의 \n은 빔프로젝터에서 줄을 바꾸는 자리 — 문제가 두 줄로 나오게 끊어 두었다
export const QUESTIONS = [
  { id:'q1', no:1, question:'다섯 대학의 공식 연혁상 출발 시점이\n빠른 순서로 바르게 나열한 것은?',
    choices:[
      '조선대 → 군산대 → 순천대 → 전북대 → 전남대',
      '순천대 → 조선대 → 군산대 → 전북대 → 전남대',
      '순천대 → 전북대 → 조선대 → 군산대 → 전남대',
      '조선대 → 순천대 → 전북대 → 전남대 → 군산대'],
    answer:1,
    explanation:'순천대 1935 · 조선대 1946 · 군산대 1947.2 · 전북대 1947.10 · 전남대 1952',
    // 해설을 표로 — 대학 이름을 나란히, 그 아래 연도 (진행자 화면)
    explanationGrid:[['순천대','1935'],['조선대','1946'],['군산대','1947.2'],['전북대','1947.10'],['전남대','1952']] },

  { id:'q2', no:2, question:'다음 다섯 문장 중 사실과 다른 것은?',
    choiceCols:1,   // 보기 다섯 줄로
    choices:[
      '전북대학교에는 표돌이·표순이라는 마스코트가 있다',
      '군산대학교 언론사에는 황룡학술문학상이 있다',
      '순천대학교의 상징동물은 호랑이다',
      '전남대학교에는 용과 봉황을 형상화한 용봉탑이 있다',
      '조선대학교는 1946년에 개교했다'],
    answer:2,
    explanation:'순천대학교의 상징동물은 독수리' },

  { id:'q3', no:3, showBefore:{ grid:[
      ['노트북','충전기','포스트잇','생수','쿠키'],
      ['마우스','이름표','네임펜','바나나','종이컵'],
      ['키보드','스티커','가위','샌드위치','휴대폰'],
      ['수첩','지우개','테이프','초콜릿','멀티탭']] },
    question:'방금 화면에 없었던 물건 두 개로만\n묶인 보기는?',
    choices:['충전기 · 이어폰','커피 · 우산','스티커 · 슬리퍼','초콜릿 · 수첩'],
    answer:1 },

  { id:'q4', no:4, question:'5명씩 10개 팀. 각 팀에서 팀원 모두가 자기 팀의 다른 사람과\n한 번씩만 하이파이브를 한다면 전체 몇 번?',
    choices:['50회','100회','200회','250회'], answer:1,
    explanation:'한 팀 4+3+2+1=10쌍, 10팀이므로 100회' },

  { id:'q5', no:5, question:'창업 아이디어 회의를 시작한 네 팀.\n더 좋은 출발을 한 팀은?',
    choices:[
      'A팀 — 요즘 AI가 대세니까 AI 챗봇을 만들자. 추천·알림·자동응답 기능을 넣자',
      'B팀 — 먼저 누가 가장 불편한지 찾아보자. 언제, 어떤 상황에서, 무엇 때문에 불편한지 확인한 뒤 해결방법을 정하자',
      'C팀 — 다른 창업경진대회 수상작을 보고 비슷하게 만들어보자',
      'D팀 — 일단 프로토타입부터 만들고 사용자를 나중에 정하자'],
    answer:1,
    explanation:'창업 아이디어는 기술이나 기능이 아니라 해결할 가치가 있는 문제에서 출발한다' },

  { id:'q6', no:6, question:'식당 대기시간 알림 서비스.\n고객이 실제로 겪은 불편과 대처 방법을 알아보려면?',
    choices:[
      '대기시간을 알려주는 앱이 있으면 편하시겠죠?',
      '이런 앱이 생기면 얼마까지 내실 수 있나요?',
      '최근 식당에서 기다리다가 계획을 바꾼 적이 있나요? 그때 어떻게 하셨나요?',
      'AI 추천과 실시간 알림 중 어떤 기능이 더 좋으세요?'],
    answer:2, explanation:'호감이나 기능 선호가 아니라 과거의 실제 경험과 행동을 묻는 질문' },

  { id:'q7', no:7, question:'중고책 거래 서비스. 10,000원 책 100권 거래, 수수료 10%.\n우리 팀 수수료 합계는?',
    choices:['10,000원','100,000원','900,000원','1,000,000원'], answer:1,
    explanation:'10,000 × 100 × 10% = 100,000원' }
];
