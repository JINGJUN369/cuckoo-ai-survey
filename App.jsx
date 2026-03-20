import { useState, useEffect, useCallback } from "react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import { QRCodeSVG } from "qrcode.react";
import { saveResult, getResults } from "./firebase.js";

const TYPES = {
  DOC: { label: "문서 생성형", icon: "📝", color: "#3B82F6", desc: "보고서, 공문, 메일 등 문서 작성 중심" },
  DATA: { label: "데이터 정리형", icon: "📊", color: "#10B981", desc: "엑셀, 수치 분석, 현황표 작업 중심" },
  SEARCH: { label: "정보 검색형", icon: "🔍", color: "#F59E0B", desc: "자료 조사, 규정 확인, 정보 탐색 중심" },
  CS: { label: "고객 응대형", icon: "🎧", color: "#EF4444", desc: "고객 상담, 클레임 처리, VOC 대응 중심" },
  COORD: { label: "업무 조율형", icon: "🔄", color: "#8B5CF6", desc: "일정 관리, 파트 간 조율, 커뮤니케이션 중심" },
};

const TOOLS = {
  claude: { name: "Claude", logo: "🟠", color: "#D97706", tagline: "구조화된 문서 작성의 달인", strengths: ["긴 보고서/기안서 작성", "복잡한 문서 구조화", "데이터 분석 및 시각화", "엑셀 수식/매크로 지원"] },
  chatgpt: { name: "ChatGPT", logo: "🟢", color: "#10B981", tagline: "만능 업무 도우미", strengths: ["데이터 분석 (Code Interpreter)", "고객 응대 스크립트 작성", "다양한 톤의 문서 작성", "이미지 생성 및 분석"] },
  gemini: { name: "Gemini", logo: "🔵", color: "#3B82F6", tagline: "구글 연동의 강자", strengths: ["구글 시트/독스 직접 연동", "Gmail/캘린더 연동", "실시간 정보 검색", "멀티모달 분석"] },
  perplexity: { name: "Perplexity", logo: "🟣", color: "#8B5CF6", tagline: "실시간 검색의 전문가", strengths: ["출처 기반 정확한 검색", "최신 정보 실시간 반영", "학술/전문 자료 탐색", "팩트 체크 및 비교 분석"] },
  genspark: { name: "GenSpark", logo: "⚡", color: "#F59E0B", tagline: "AI 검색의 새로운 패러다임", strengths: ["멀티 에이전트 검색", "종합 리서치 보고서", "비교 분석 자동화", "시각적 정보 정리"] },
};

const TOOL_MATCH = {
  DOC: { primary: "claude", secondary: "chatgpt", reason: "긴 보고서, 공문, 기안서 등 구조화된 문서 작성에 가장 강력" },
  DATA: { primary: "claude", secondary: "chatgpt", reason: "엑셀 분석, 수식 작성, 데이터 시각화까지 파일로 바로 생성 가능" },
  SEARCH: { primary: "perplexity", secondary: "claude", reason: "출처 기반 실시간 검색 + Claude로 검색 결과 정리/분석" },
  CS: { primary: "chatgpt", secondary: "claude", reason: "무료로 바로 사용 가능 + 다양한 톤의 응대 스크립트 생성에 강점" },
  COORD: { primary: "gemini", secondary: "claude", reason: "구글 캘린더/메일 연동 + Claude로 회의록/일정 문서 정리" },
};

const JOBS = ["설치관리", "수금관리", "서비스관리", "컨택센터", "PL관리", "사무관리", "자재관리", "기타"];

const QUESTIONS = [
  { id: "job", question: "담당하고 계신 주된 업무를 선택해 주세요", subtitle: "가장 가까운 항목을 선택하세요", options: JOBS.map(j => ({ text: j, scores: {} })), isInfo: true, multi: false },
  { id: "q1", question: "월요일 아침 출근해서 PC를 켜면 가장 먼저 하는 일은?", subtitle: "해당하는 것을 모두 선택하세요 (최대 2개)", multi: true, maxPick: 2, options: [
    { text: "밀린 메일/메신저 확인하고 답변 작성", scores: { DOC: 2, COORD: 1 } },
    { text: "주간 실적/현황 데이터 업데이트", scores: { DATA: 3 } },
    { text: "지난주 이슈 관련 자료 검색/확인", scores: { SEARCH: 2, DOC: 1 } },
    { text: "미처리 고객 문의/클레임 이어서 처리", scores: { CS: 3 } },
    { text: "금주 일정 확인하고 업무 우선순위 정리", scores: { COORD: 3 } },
  ]},
  { id: "q2", question: "지난 한 주를 돌아보면, 가장 많은 시간을 쓴 업무는?", subtitle: "해당하는 것을 모두 선택하세요 (최대 2개)", multi: true, maxPick: 2, options: [
    { text: "보고서/공문/메일 등 문서 작성 및 수정", scores: { DOC: 3 } },
    { text: "엑셀 데이터 입력, 정리, 수식 작업", scores: { DATA: 3 } },
    { text: "규정/사례/자료 검색 및 정리", scores: { SEARCH: 3 } },
    { text: "고객/협력업체 전화, 채팅, 메일 응대", scores: { CS: 3 } },
    { text: "일정 조율, 회의, 유관부서 소통", scores: { COORD: 3 } },
  ]},
  { id: "q3", question: "ERP나 사내 시스템에서 주로 하는 작업은?", subtitle: "해당하는 것을 모두 선택하세요 (최대 2개)", multi: true, maxPick: 2, options: [
    { text: "기안서/품의서 작성 및 결재 요청", scores: { DOC: 2, COORD: 1 } },
    { text: "데이터 조회/추출 후 엑셀로 가공", scores: { DATA: 3 } },
    { text: "이전 처리 이력/규정 검색 및 참조", scores: { SEARCH: 2, DATA: 1 } },
    { text: "고객 정보 조회/상담 이력 입력", scores: { CS: 2, DATA: 1 } },
    { text: "설치/서비스 일정 배정 및 변경", scores: { COORD: 2, DATA: 1 } },
  ]},
  { id: "q4", question: "업무 중 갑자기 이런 요청이 들어왔습니다. 가장 익숙한 상황은?", subtitle: "하나만 선택해 주세요", multi: false, options: [
    { text: "\"이 내용으로 오늘까지 보고서 정리해 줘\"", scores: { DOC: 3 } },
    { text: "\"이 엑셀 데이터 틀린 부분 찾아서 수정해 줘\"", scores: { DATA: 3 } },
    { text: "\"이 건 관련 규정이 뭔지 찾아봐 줘\"", scores: { SEARCH: 3 } },
    { text: "\"고객이 화나서 전화했는데 좀 받아줘\"", scores: { CS: 3 } },
    { text: "\"내일 회의 일정 잡고 참석자 조율해 줘\"", scores: { COORD: 3 } },
  ]},
  { id: "q5", question: "업무 중 가장 스트레스 받는 순간은?", subtitle: "해당하는 것을 모두 선택하세요 (최대 2개)", multi: true, maxPick: 2, options: [
    { text: "급하게 문서/보고서를 만들어야 할 때", scores: { DOC: 2 } },
    { text: "데이터가 안 맞거나 수작업이 많을 때", scores: { DATA: 2 } },
    { text: "필요한 정보/자료를 도저히 못 찾을 때", scores: { SEARCH: 2 } },
    { text: "화난 고객을 응대하거나 민원 처리할 때", scores: { CS: 2 } },
    { text: "여러 부서/사람 사이에서 조율이 안 될 때", scores: { COORD: 2 } },
  ]},
  { id: "q6", question: "동료가 \"이것 좀 도와줘\" 할 때, 주로 어떤 도움을 요청받나요?", subtitle: "하나만 선택해 주세요", multi: false, options: [
    { text: "문서 작성이나 문구 다듬기", scores: { DOC: 2, CS: 1 } },
    { text: "엑셀 수식이나 데이터 정리", scores: { DATA: 3 } },
    { text: "관련 규정이나 자료 찾아주기", scores: { SEARCH: 2, DOC: 1 } },
    { text: "고객 응대 방법이나 스크립트 조언", scores: { CS: 2, COORD: 1 } },
    { text: "일정 조율이나 업무 분배 도움", scores: { COORD: 2, DOC: 1 } },
  ]},
  { id: "q7", question: "퇴근 직전, 내일 해야 할 일을 정리합니다. 가장 많은 항목은?", subtitle: "하나만 선택해 주세요", multi: false, options: [
    { text: "작성/수정해야 할 문서 목록", scores: { DOC: 2, DATA: 1 } },
    { text: "확인/정리해야 할 데이터 작업", scores: { DATA: 2, DOC: 1 } },
    { text: "확인해야 할 자료/검색할 내용", scores: { SEARCH: 2 } },
    { text: "연락해야 할 고객/협력업체 리스트", scores: { CS: 2, COORD: 1 } },
    { text: "잡아야 할 미팅/조율할 일정", scores: { COORD: 2, CS: 1 } },
  ]},
  { id: "q8", question: "이상적인 업무 도구가 있다면 어떤 기능이 가장 필요한가요?", subtitle: "해당하는 것을 모두 선택하세요 (최대 2개)", multi: true, maxPick: 2, options: [
    { text: "문서 자동 작성 (보고서/공문/메일 초안)", scores: { DOC: 2 } },
    { text: "데이터 자동 분석 및 오류 체크", scores: { DATA: 2 } },
    { text: "원하는 정보를 정확히 찾아주는 검색", scores: { SEARCH: 2 } },
    { text: "고객 응대 답변/스크립트 자동 생성", scores: { CS: 2 } },
    { text: "일정 자동 관리 및 업무 배분", scores: { COORD: 2 } },
  ]},
  { id: "q9", question: "내 업무에서 AI가 가장 먼저 도와줬으면 하는 일은?", subtitle: "해당하는 것을 모두 선택하세요 (최대 2개)", multi: true, maxPick: 2, options: [
    { text: "보고서/문서 초안 작성 및 교정", scores: { DOC: 2 } },
    { text: "엑셀 데이터 분석, 차트 생성, 수식 작성", scores: { DATA: 2 } },
    { text: "업무 관련 규정/사례/자료 빠른 검색", scores: { SEARCH: 2 } },
    { text: "고객 응대 스크립트/답변 메시지 작성", scores: { CS: 2 } },
    { text: "회의록 정리, 일정 관리, 업무 요약", scores: { COORD: 2 } },
  ]},
];

function calcProfile(scores) {
  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  const percents = {};
  Object.keys(TYPES).forEach(k => { percents[k] = Math.round((scores[k] || 0) / total * 100); });
  const sorted = Object.entries(percents).sort((a, b) => b[1] - a[1]);
  return { percents, topType: sorted[0][0], sorted };
}

const FN = "'Noto Sans KR', sans-serif";

// ============ SCREENS ============

function WelcomeScreen({ onStart, onDashboard, participantCount }) {
  const [v, setV] = useState(false);
  const [url, setUrl] = useState("");
  useEffect(() => { setTimeout(() => setV(true), 100); setUrl(window.location.href); }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "0 24px", opacity: v ? 1 : 0, transform: v ? "translateY(0)" : "translateY(32px)", transition: "all 0.7s" }}>
      <div style={{ fontSize: "4rem", marginBottom: 16 }}>🤖</div>
      <h1 style={{ fontFamily: FN, fontSize: "2rem", fontWeight: 800, background: "linear-gradient(135deg, #3B82F6, #8B5CF6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 8, textAlign: "center", lineHeight: 1.3 }}>나에게 맞는 AI 도구는?</h1>
      <p style={{ color: "#94A3B8", fontSize: "1rem", marginBottom: 8, textAlign: "center" }}>고객만족팀 AI 업무 도구 활용 교육</p>
      <p style={{ color: "#64748B", fontSize: "0.85rem", marginBottom: 28, textAlign: "center", lineHeight: 1.6 }}>8개의 간단한 질문에 답하면<br/>나의 업무 유형과 최적의 AI 도구를 추천해 드립니다</p>
      {url && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 16, marginBottom: 24, boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}>
          <QRCodeSVG value={url} size={160} bgColor="#ffffff" fgColor="#0F172A" level="M" />
        </div>
      )}
      <p style={{ color: "#64748B", fontSize: "0.78rem", marginBottom: 20 }}>📱 스마트폰으로 QR을 스캔하세요</p>
      <button onClick={onStart} style={{ background: "linear-gradient(135deg, #3B82F6, #8B5CF6)", color: "#fff", border: "none", borderRadius: 16, padding: "16px 48px", fontSize: "1.1rem", fontWeight: 700, cursor: "pointer", fontFamily: FN, boxShadow: "0 4px 24px rgba(99,102,241,0.4)", marginBottom: 12 }}>설문 시작하기 →</button>
      <button onClick={onDashboard} style={{ background: "transparent", border: "1px solid #334155", borderRadius: 12, padding: "12px 36px", color: "#94A3B8", fontSize: "0.9rem", fontFamily: FN, cursor: "pointer" }}>
        📊 결과 대시보드 {participantCount > 0 && `(${participantCount}명)`}
      </button>
      <p style={{ color: "#475569", fontSize: "0.75rem", marginTop: 24 }}>소요시간 약 2분</p>
    </div>
  );
}

function NameInput({ onSubmit }) {
  const [name, setName] = useState("");
  const [v, setV] = useState(false);
  useEffect(() => { setTimeout(() => setV(true), 100); }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "0 24px", opacity: v ? 1 : 0, transform: v ? "translateY(0)" : "translateY(24px)", transition: "all 0.5s" }}>
      <div style={{ background: "rgba(59,130,246,0.1)", borderRadius: 20, padding: "40px 32px", maxWidth: 420, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: 16 }}>👋</div>
        <h2 style={{ fontFamily: FN, fontSize: "1.4rem", fontWeight: 700, color: "#E2E8F0", marginBottom: 8 }}>이름을 입력해 주세요</h2>
        <p style={{ color: "#94A3B8", fontSize: "0.85rem", marginBottom: 24 }}>결과 화면에 표시됩니다</p>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="이름 입력"
          onKeyDown={e => { if (e.key === "Enter" && name.trim()) onSubmit(name.trim()); }}
          style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "2px solid #334155", background: "#1E293B", color: "#E2E8F0", fontSize: "1rem", fontFamily: FN, outline: "none", textAlign: "center", boxSizing: "border-box" }}
          autoFocus />
        <button onClick={() => name.trim() && onSubmit(name.trim())} disabled={!name.trim()}
          style={{ marginTop: 16, background: name.trim() ? "linear-gradient(135deg, #3B82F6, #8B5CF6)" : "#334155", color: name.trim() ? "#fff" : "#64748B", border: "none", borderRadius: 12, padding: "14px 40px", fontSize: "1rem", fontWeight: 600, cursor: name.trim() ? "pointer" : "default", fontFamily: FN, width: "100%", transition: "all 0.3s" }}>다음 →</button>
      </div>
    </div>
  );
}

function QuestionScreen({ question, index, total, onSelect }) {
  const [v, setV] = useState(false);
  const [sel, setSel] = useState(null);
  const [multiSel, setMultiSel] = useState([]);
  useEffect(() => { setV(false); setSel(null); setMultiSel([]); setTimeout(() => setV(true), 50); }, [index]);
  const pct = ((index + 1) / total) * 100;
  const isMulti = question.multi;
  const maxPick = question.maxPick || 2;

  const pickSingle = (i) => { setSel(i); setTimeout(() => onSelect([i]), 400); };
  const toggleMulti = (i) => {
    setMultiSel(prev => {
      if (prev.includes(i)) return prev.filter(x => x !== i);
      if (prev.length >= maxPick) return prev;
      return [...prev, i];
    });
  };
  const confirmMulti = () => { if (multiSel.length > 0) onSelect(multiSel); };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", padding: "32px 20px", maxWidth: 520, margin: "0 auto", opacity: v ? 1 : 0, transform: v ? "translateY(0)" : "translateY(24px)", transition: "all 0.5s" }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: "#64748B", fontSize: "0.8rem", fontFamily: FN }}>{index + 1} / {total}</span>
          <span style={{ color: "#64748B", fontSize: "0.8rem" }}>{Math.round(pct)}%</span>
        </div>
        <div style={{ height: 6, background: "#1E293B", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, #3B82F6, #8B5CF6)", borderRadius: 3, transition: "width 0.5s" }} />
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <h2 style={{ fontFamily: FN, fontSize: "1.3rem", fontWeight: 700, color: "#F1F5F9", marginBottom: 6, lineHeight: 1.4 }}>{question.question}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
          <p style={{ color: "#64748B", fontSize: "0.85rem", margin: 0 }}>{question.subtitle}</p>
          {isMulti && <span style={{ background: "rgba(99,102,241,0.2)", color: "#A5B4FC", padding: "2px 8px", borderRadius: 8, fontSize: "0.7rem", fontWeight: 600, fontFamily: FN }}>복수선택</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {question.options.map((opt, i) => {
            const isSelected = isMulti ? multiSel.includes(i) : sel === i;
            const isDisabled = isMulti && !isSelected && multiSel.length >= maxPick;
            return (
              <button key={i} onClick={() => isMulti ? toggleMulti(i) : pickSingle(i)}
                style={{
                  background: isSelected ? "linear-gradient(135deg, #3B82F6, #6366F1)" : isDisabled ? "rgba(30,41,59,0.4)" : "rgba(30,41,59,0.8)",
                  border: isSelected ? "2px solid #6366F1" : "2px solid #334155",
                  borderRadius: 14, padding: "16px 20px", textAlign: "left",
                  color: isSelected ? "#fff" : isDisabled ? "#475569" : "#CBD5E1",
                  fontSize: "0.95rem", fontFamily: FN, cursor: isDisabled ? "default" : "pointer",
                  transition: "all 0.25s", transform: isSelected ? "scale(1.02)" : "scale(1)",
                  opacity: isDisabled ? 0.5 : 1,
                }}>
                <span style={{ marginRight: 10, opacity: 0.5 }}>
                  {isMulti ? (isSelected ? "☑" : "☐") : String.fromCharCode(9312 + i)}
                </span>{opt.text}
              </button>
            );
          })}
        </div>
        {isMulti && (
          <button onClick={confirmMulti} disabled={multiSel.length === 0}
            style={{
              marginTop: 16, background: multiSel.length > 0 ? "linear-gradient(135deg, #3B82F6, #8B5CF6)" : "#334155",
              color: multiSel.length > 0 ? "#fff" : "#64748B", border: "none", borderRadius: 12,
              padding: "14px", fontSize: "1rem", fontWeight: 600, fontFamily: FN,
              cursor: multiSel.length > 0 ? "pointer" : "default", transition: "all 0.3s",
            }}>
            선택 완료 ({multiSel.length}/{maxPick}) →
          </button>
        )}
      </div>
    </div>
  );
}

function MiniRadar({ scores, size = 90 }) {
  const { percents } = calcProfile(scores);
  const data = Object.keys(TYPES).map(k => ({ type: TYPES[k].label.replace("형", ""), value: percents[k], fullMark: 100 }));
  return (
    <div style={{ width: size, height: size, flexShrink: 0 }}>
      <ResponsiveContainer>
        <RadarChart data={data}>
          <PolarGrid stroke="#334155" />
          <PolarAngleAxis dataKey="type" tick={false} />
          <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
          <Radar dataKey="value" stroke="#6366F1" fill="#6366F1" fillOpacity={0.3} strokeWidth={1.5} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ResultScreen({ name, job, scores, onDashboard, onRestart }) {
  const [v, setV] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => {
    setTimeout(() => setV(true), 100);
    setTimeout(() => setStep(1), 500);
    setTimeout(() => setStep(2), 1000);
    setTimeout(() => setStep(3), 1500);
    setTimeout(() => setStep(4), 2000);
    setTimeout(() => setStep(5), 2500);
    setTimeout(() => setStep(6), 3000);
    setTimeout(() => setStep(7), 3500);
    setTimeout(() => setStep(8), 4000);
  }, []);

  const { percents, topType, sorted } = calcProfile(scores);
  const secondType = sorted[1][0];
  const match = TOOL_MATCH[topType];
  const pt = TOOLS[match.primary];
  const st = TOOLS[match.secondary];
  const barData = sorted.map(([k, val]) => ({ key: k, value: val, ...TYPES[k] }));

  const TOOL_URLS = { claude: "https://claude.ai", chatgpt: "https://chat.openai.com", gemini: "https://gemini.google.com", perplexity: "https://perplexity.ai", genspark: "https://genspark.ai" };

  // 업무별 맞춤 프롬프트 (job × topType 조합)
  const JOB_PROMPTS = {
    "설치관리": {
      DOC: [["설치 보고서", "오늘 설치 완료한 10건의 데이터를 정리하고 일일 설치 완료 보고서를 작성해 줘. 지역별/제품별로 분류해 줘."], ["설치 일정표", "이번 주 설치 예정 건수를 요일별/지역별로 정리한 일정표를 만들어 줘."], ["설치 매뉴얼", "CHP-7300R 모델 설치 시 주의사항을 체크리스트 형태로 정리해 줘."]],
      DATA: [["설치 현황 분석", "첨부한 엑셀은 이번 달 설치 데이터야. 지역별 설치 건수, 평균 소요시간, 재설치율을 분석해 줘."], ["설치 효율 비교", "이 데이터에서 기사별 설치 건수와 고객 만족도를 비교 분석해 줘. 표와 차트로 보여줘."], ["이상값 체크", "이 설치 데이터에서 소요시간이 비정상적으로 긴 건이나 누락된 항목을 찾아줘."]],
      SEARCH: [["설치 규정", "정수기 설치 시 수도법상 필요한 인증이나 규정을 찾아줘. 출처도 알려줘."], ["설치 기술", "정수기 직수형 설치 시 배관 연결 방식별 장단점을 비교해 줘."]],
      CS: [["설치 불만 응대", "설치 후 물맛이 이상하다는 고객에게 보낼 안내 문자를 작성해 줘. 원인 설명과 해결 방법을 포함해 줘."], ["설치 일정 안내", "설치 예약 고객에게 보낼 사전 안내 문자를 작성해 줘. 준비사항과 소요시간을 포함해 줘."]],
      COORD: [["설치 일정 배분", "이번 주 설치 예정 30건이야. 기사 5명에게 지역/시간대를 고려해서 균등 배분해 줘."], ["설치팀 회의록", "오늘 설치팀 회의 내용을 정리해 줘. 안건/결정사항/담당자/기한으로 구분해 줘."]],
    },
    "수금관리": {
      DOC: [["수금 보고서", "이번 달 수금 현황 데이터로 월간 수금 보고서를 작성해 줘. 목표 대비 달성률, 미수금 상위 10건 포함."], ["독촉 공문", "3개월 이상 미납 고객에게 보낼 공식 독촉 공문을 작성해 줘. 법적 근거와 납부 방법을 포함해 줘."], ["수금 계획서", "다음 달 수금 계획서를 작성해 줘. 중점 관리 대상과 전략을 포함해 줘."]],
      DATA: [["미수금 분석", "첨부한 미수금 데이터를 분석해 줘. 기간별/금액대별/지역별 분포와 추이를 보여줘."], ["수금률 추이", "최근 6개월 수금률 데이터를 분석하고 다음 달 예상치를 추정해 줘."], ["이상 데이터 체크", "이 수금 데이터에서 입금일자와 금액이 맞지 않는 건, 중복 입금 건을 찾아줘."]],
      SEARCH: [["채권 관련 법률", "렌탈 미납 시 채권 추심 관련 법률과 소비자 보호 규정을 정리해 줘."], ["수금 전략", "B2B 미수금 회수율을 높이는 최신 전략과 사례를 찾아줘."]],
      CS: [["단계별 독촉 문자", "미납 고객에게 보낼 문자를 3단계로 작성해 줘. 1단계 안내, 2단계 독촉, 3단계 최종 통보."], ["납부 안내", "분할 납부를 안내하는 친절한 상담 스크립트를 작성해 줘."]],
      COORD: [["수금 회의 준비", "내일 수금 회의 자료를 정리해 줘. 미수금 현황, 주요 이슈, 대응 방안으로 구분해 줘."], ["업무 배분", "미수금 상위 50건을 담당자 3명에게 금액대와 지역을 고려해 배분해 줘."]],
    },
    "서비스관리": {
      DOC: [["서비스 보고서", "이번 달 서비스 접수/처리 현황으로 월간 보고서를 작성해 줘. 유형별 접수 건수와 처리율 포함."], ["품질 분석서", "이 클레임 데이터를 분석해서 품질 개선 보고서를 작성해 줘. 반복 발생 항목과 개선 제안 포함."], ["기술 공지", "필터 교체 절차가 변경되었어. 전 서비스 기사에게 보낼 기술 공지문을 작성해 줘."]],
      DATA: [["서비스 데이터 분석", "첨부한 서비스 접수 데이터를 분석해 줘. 제품별/유형별/지역별 접수 추이를 차트로 보여줘."], ["부품 사용량 분석", "이 부품 사용 데이터에서 월별 소모량 추이와 재고 부족 예상 부품을 알려줘."], ["데이터 검증", "이 서비스 완료 데이터에서 처리시간이 비정상이거나 부품코드가 누락된 건을 찾아줘."]],
      SEARCH: [["제품 하자 기준", "소비자 분쟁 해결 기준에서 정수기 제품 하자 교환/환불 기준을 찾아줘."], ["경쟁사 서비스", "코웨이, SK매직, 청호나이스의 정수기 A/S 정책을 비교해 줘."]],
      CS: [["클레임 응대", "정수기에서 소음이 난다는 고객 클레임에 대한 응대 스크립트를 작성해 줘. 공감/확인/해결 순서로."], ["서비스 만족도", "서비스 완료 후 고객에게 보낼 만족도 조사 문자를 작성해 줘."]],
      COORD: [["서비스 일정 관리", "이번 주 서비스 예약 40건을 기사 8명에게 효율적으로 배분해 줘. 지역과 긴급도를 고려해 줘."], ["품질 회의록", "품질 개선 회의 내용을 정리해 줘. 이슈/원인/대책/담당자/기한으로 구분."]],
    },
    "컨택센터": {
      DOC: [["상담 매뉴얼", "신제품 CP-AJ 관련 고객 문의 예상 Q&A를 20개 작성해 줘. 질문과 모범 답변 포함."], ["VOC 보고서", "이번 주 VOC 데이터를 분석해서 주간 보고서를 작성해 줘. 주요 불만 유형과 개선 제안 포함."]],
      DATA: [["상담 통계 분석", "이 콜 데이터에서 시간대별/유형별 인입량과 평균 처리시간을 분석해 줘."], ["상담 품질 체크", "이 상담 이력 데이터에서 처리 미완료 건, 재문의 건수를 찾아 정리해 줘."]],
      SEARCH: [["상담 트렌드", "콜센터 AI 도입 사례와 상담 품질 향상 방안을 찾아줘."], ["소비자 보호", "전자상거래 소비자 보호법에서 정수기 렌탈 관련 조항을 정리해 줘."]],
      CS: [["불만 고객 응대", "매우 화난 고객이 환불을 요구해. 공감하면서 절차를 안내하는 스크립트를 작성해 줘."], ["감사 인사", "장기 이용 고객에게 보낼 감사 메시지를 작성해 줘. VIP 혜택 안내도 포함."], ["다국어 응대", "외국인 고객이 영어로 문의해. 정수기 필터 교체 안내를 영어로 작성해 줘."]],
      COORD: [["상담 인력 배치", "시간대별 콜 인입량 데이터를 보고 최적의 상담원 배치를 제안해 줘."], ["교대 일정", "상담원 10명의 이번 주 교대 근무표를 만들어 줘. 공평하게 배분해 줘."]],
    },
    "PL관리": {
      DOC: [["PL 보고서", "이번 달 제품 클레임 데이터로 PL 현황 보고서를 작성해 줘. 제품별/유형별 발생 건수와 추이 포함."], ["리콜 공문", "특정 로트 제품에 대한 자발적 리콜 안내 공문을 작성해 줘. 법적 요건을 충족하도록."], ["개선 보고서", "반복 발생하는 이 하자에 대한 원인 분석과 개선 대책 보고서를 작성해 줘."]],
      DATA: [["PL 데이터 분석", "첨부한 클레임 데이터에서 제품별/부위별/시기별 패턴을 분석해 줘. 차트 포함."], ["불량률 추이", "최근 12개월 불량률 추이를 분석하고 이상치가 있는 월을 알려줘."], ["데이터 검증", "이 PL 접수 데이터에서 제품코드 오류, 날짜 누락, 중복 건을 찾아줘."]],
      SEARCH: [["PL법 규정", "제조물 책임법에서 정수기/비데 관련 판례와 기준을 찾아줘."], ["안전 기준", "전기용품 안전 기준에서 정수기 관련 최신 규정을 정리해 줘."]],
      CS: [["하자 안내", "제품 하자로 교환이 결정된 고객에게 보낼 안내 문자를 작성해 줘. 일정과 절차 포함."], ["보상 안내", "제품 하자로 인한 보상 절차를 안내하는 정중한 메일을 작성해 줘."]],
      COORD: [["품질 회의 준비", "월간 품질 회의 자료를 정리해 줘. PL 현황, 주요 이슈, 개선 진행 상황으로."], ["유관부서 협조", "품질팀에 보낼 하자 분석 협조 요청 메일을 작성해 줘. 필요 데이터와 기한을 명시해 줘."]],
    },
    "사무관리": {
      DOC: [["업무 보고서", "이번 주 부서 업무 현황을 정리한 주간 보고서를 작성해 줘."], ["회의록 작성", "오늘 팀 회의 내용을 정리해 줘. 안건/논의/결정/액션아이템으로 구분."], ["공문 작성", "협력업체에 보낼 계약 갱신 안내 공문을 작성해 줘."]],
      DATA: [["예산 정리", "이번 분기 부서 예산 사용 현황을 정리하고 잔액을 계산해 줘."], ["실적 집계", "각 파트에서 올라온 실적 데이터를 합쳐서 부서 전체 현황표를 만들어 줘."], ["데이터 검증", "이 경비 데이터에서 금액 오류, 중복 처리, 누락 건을 찾아줘."]],
      SEARCH: [["업무 규정", "사내 경비 처리 규정이나 출장비 기준을 정리해 줘."], ["트렌드 조사", "고객만족팀 업무 효율화 사례나 최신 CS 트렌드를 조사해 줘."]],
      CS: [["메일 답변", "이 메일에 대한 답변을 작성해 줘. 정중하면서도 핵심을 명확히 전달하는 톤으로."], ["안내문", "전 직원에게 보낼 시스템 점검 안내 메일을 작성해 줘."]],
      COORD: [["일정 관리", "이번 달 부서 행사, 회의, 보고 일정을 캘린더 형태로 정리해 줘."], ["업무 분배", "이 프로젝트의 업무를 팀원 역할별로 분배하고 타임라인을 만들어 줘."]],
    },
    "자재관리": {
      DOC: [["입출고 보고서", "이번 달 자재 입출고 현황을 정리한 월간 보고서를 작성해 줘. 품목별/거래처별로 분류해 줘."], ["발주서 작성", "아래 부품 목록으로 협력업체에 보낼 발주서를 작성해 줘. 수량, 단가, 납기일 포함."], ["재고 실사 보고", "재고 실사 결과를 정리한 보고서를 작성해 줘. 장부 재고와 실물 재고 차이를 포함해 줘."]],
      DATA: [["재고 현황 분석", "첨부한 재고 데이터를 분석해 줘. 품목별 재고량, 회전율, 과잉/부족 재고를 표시해 줘."], ["입출고 추이 분석", "최근 6개월 부품 입출고 추이를 분석하고 계절별 패턴이 있는지 알려줘."], ["발주점 계산", "이 부품 사용량 데이터로 적정 발주점(ROP)과 안전재고량을 계산해 줘."]],
      SEARCH: [["부품 호환성 확인", "CHP-7300R 모델에 호환되는 필터 규격과 대체 부품을 찾아줘."], ["물류 규정", "위험물 부품 운송 시 관련 규정과 안전 기준을 정리해 줘."]],
      CS: [["납기 지연 안내", "부품 납기가 지연되는 서비스센터에 보낼 안내 문자를 작성해 줘. 대안과 예상 일정 포함."], ["자재 요청 회신", "현장에서 긴급 자재 요청이 왔어. 재고 상황을 안내하고 대안을 제시하는 답변을 작성해 줘."]],
      COORD: [["발주 일정 관리", "이번 달 발주 예정 품목과 납기일을 정리하고 우선순위를 매겨줘."], ["거래처 미팅 준비", "거래처 단가 협상 미팅 준비 자료를 정리해 줘. 현 단가, 시세 변동, 협상 포인트 포함."]],
    },
    "기타": {
      DOC: [["업무 보고서", "이번 주 담당 업무 현황을 정리한 주간 보고서를 작성해 줘."], ["메일 작성", "유관부서에 보낼 협조 요청 메일을 작성해 줘. 요청 배경과 기한을 포함해 줘."], ["제안서", "업무 개선 제안서를 작성해 줘. 현황/문제점/개선안/기대효과 순서로."]],
      DATA: [["데이터 정리", "이 엑셀 데이터를 깔끔하게 정리하고 요약 표를 만들어 줘."], ["현황 분석", "첨부 데이터를 분석해서 주요 수치와 추이를 정리해 줘."], ["오류 체크", "이 데이터에서 누락, 중복, 형식 오류를 찾아줘."]],
      SEARCH: [["규정 확인", "담당 업무 관련 최신 규정이나 가이드라인을 찾아 정리해 줘."], ["사례 조사", "타 회사의 유사 업무 효율화 사례를 조사해 줘."]],
      CS: [["응대 메시지", "고객/협력업체에 보낼 정중한 안내 메시지를 작성해 줘."], ["불만 대응", "이 불만 사항에 대한 적절한 답변을 작성해 줘. 공감과 해결 방안을 포함해 줘."]],
      COORD: [["일정 관리", "이번 주 업무 일정을 우선순위별로 정리해 줘."], ["회의록", "오늘 회의 내용을 정리해 줘. 결정사항과 후속 조치를 명확히 구분해 줘."]],
    },
  };

  // 업무별 워크플로우
  const WORKFLOWS = {
    "설치관리": [
      { step: "1", icon: "📥", title: "ERP에서 설치 데이터 추출", desc: "일별/주별 설치 현황 엑셀 다운로드" },
      { step: "2", icon: "🤖", title: "AI에 데이터 업로드", desc: "\"이 데이터를 분석하고 이상값을 찾아줘\"" },
      { step: "3", icon: "📊", title: "분석 결과 확인 & 보고서 생성", desc: "\"이 분석 결과로 일일 보고서를 작성해 줘\"" },
      { step: "4", icon: "✅", title: "검토 후 보고", desc: "AI 결과물을 확인/수정 후 최종 제출" },
    ],
    "수금관리": [
      { step: "1", icon: "📥", title: "ERP에서 미수금 데이터 추출", desc: "미수금 현황/입금 내역 엑셀 다운로드" },
      { step: "2", icon: "🤖", title: "AI로 데이터 검증", desc: "\"이 데이터에서 금액 불일치, 중복 입금을 찾아줘\"" },
      { step: "3", icon: "📱", title: "독촉 메시지 자동 생성", desc: "\"미납 3개월 고객 독촉 문자를 단계별로 작성해 줘\"" },
      { step: "4", icon: "📋", title: "수금 보고서 생성", desc: "\"이 데이터로 월간 수금 보고서를 만들어 줘\"" },
    ],
    "서비스관리": [
      { step: "1", icon: "📥", title: "ERP에서 서비스 접수 데이터 추출", desc: "접수/처리/부품 사용 현황 다운로드" },
      { step: "2", icon: "🤖", title: "AI로 패턴 분석", desc: "\"제품별/유형별 클레임 패턴을 분석해 줘\"" },
      { step: "3", icon: "🔍", title: "품질 이슈 검색", desc: "Perplexity로 관련 규정/판례 확인" },
      { step: "4", icon: "📝", title: "보고서 및 공지 작성", desc: "Claude로 품질 보고서/기술 공지 생성" },
    ],
    "컨택센터": [
      { step: "1", icon: "📞", title: "고객 문의/클레임 접수", desc: "상담 내용 메모 또는 녹취록 확보" },
      { step: "2", icon: "🤖", title: "AI로 응대 스크립트 생성", desc: "\"이 상황에 맞는 응대 스크립트를 작성해 줘\"" },
      { step: "3", icon: "📊", title: "VOC 데이터 분석", desc: "\"이번 주 VOC를 유형별로 분류하고 주요 패턴을 분석해 줘\"" },
      { step: "4", icon: "📋", title: "FAQ/매뉴얼 업데이트", desc: "\"신규 문의 유형을 FAQ에 추가해 줘\"" },
    ],
    "PL관리": [
      { step: "1", icon: "📥", title: "클레임/하자 데이터 수집", desc: "ERP 및 현장 보고서에서 데이터 추출" },
      { step: "2", icon: "🤖", title: "AI로 불량 패턴 분석", desc: "\"제품별/부위별 하자 패턴과 추이를 분석해 줘\"" },
      { step: "3", icon: "🔍", title: "법규/기준 검색", desc: "Perplexity로 PL법, 안전기준 최신 규정 확인" },
      { step: "4", icon: "📝", title: "개선 보고서 작성", desc: "Claude로 원인분석/개선대책 보고서 생성" },
    ],
    "사무관리": [
      { step: "1", icon: "📧", title: "메일/보고 요청 접수", desc: "업무 메일, 보고 요청 등 확인" },
      { step: "2", icon: "🤖", title: "AI로 초안 생성", desc: "\"이 내용으로 보고서/메일/공문 초안을 작성해 줘\"" },
      { step: "3", icon: "📊", title: "데이터 취합/검증", desc: "\"각 파트 데이터를 합쳐서 현황표를 만들어 줘\"" },
      { step: "4", icon: "✅", title: "검토 후 발송/보고", desc: "AI 결과물 수정 후 최종 제출" },
    ],
    "자재관리": [
      { step: "1", icon: "📥", title: "ERP에서 재고/입출고 데이터 추출", desc: "품목별 재고 현황, 입출고 이력 다운로드" },
      { step: "2", icon: "🤖", title: "AI로 재고 분석 및 이상 탐지", desc: "\"재고 데이터에서 과잉/부족 품목과 회전율을 분석해 줘\"" },
      { step: "3", icon: "📋", title: "발주서/보고서 자동 생성", desc: "\"분석 결과로 발주 필요 품목과 수량을 정리해 줘\"" },
      { step: "4", icon: "✅", title: "검토 후 발주/보고", desc: "AI 결과물 확인 후 발주 진행 또는 보고" },
    ],
    "기타": [
      { step: "1", icon: "📋", title: "업무 요청 확인", desc: "메일, 메신저 등으로 들어온 업무 요청 확인" },
      { step: "2", icon: "🤖", title: "AI에게 초안/분석 요청", desc: "\"이 내용을 정리해 줘\" 또는 \"이 데이터를 분석해 줘\"" },
      { step: "3", icon: "🔍", title: "필요 시 추가 검색", desc: "Perplexity로 관련 정보/규정 확인" },
      { step: "4", icon: "✅", title: "결과물 검토 후 활용", desc: "AI 결과물 수정/보완 후 업무에 적용" },
    ],
  };

  // 업무별 이메일 답변 예시
  const EMAIL_EXAMPLES = {
    "설치관리": { from: "고객 박지수", subject: "설치 일정 변경 요청", body: "안녕하세요, 3월 5일 예정된 정수기 설치를 3월 8일로 변경할 수 있을까요? 출장 일정이 잡혀서요.", prompt: "위 메일에 대한 답변을 작성해 줘.\n\n조건:\n- 일정 변경 가능 여부 확인\n- 변경 시 가능한 시간대 2~3개 제시\n- 설치 전 준비사항 안내\n- 친절하고 전문적인 톤" },
    "수금관리": { from: "거래처 이과장", subject: "2월 렌탈료 납부 관련 문의", body: "안녕하세요, 2월 렌탈료 청구서를 받았는데 금액이 작년과 다릅니다. 확인 부탁드립니다.", prompt: "위 메일에 대한 답변을 작성해 줘.\n\n조건:\n- 요금 변동 사유 설명 (렌탈료 인상/부가서비스 추가 등)\n- 상세 내역 첨부 안내\n- 문의처 안내\n- 정중하면서도 명확한 톤" },
    "서비스관리": { from: "서비스센터 김기사", subject: "CP-AM 모델 반복 누수 보고", body: "안녕하세요, 이번 주에만 CP-AM 모델 누수 건이 3건 접수되었습니다. 동일 부위(급수밸브)에서 발생하고 있어 품질 확인 요청드립니다.", prompt: "위 메일에 대한 답변을 작성해 줘.\n\n조건:\n- 보고 감사 인사\n- 해당 건 품질팀 전달 예정 알림\n- 추가 정보 요청 (로트번호, 사진 등)\n- 임시 조치 방법 안내" },
    "컨택센터": { from: "VIP 고객 정회원", subject: "상담원 응대 불만", body: "오늘 전화 상담에서 상담원이 제 말을 끊고 일방적으로 안내만 했습니다. 10년 이용 고객인데 너무 실망스럽습니다.", prompt: "위 메일에 대한 답변을 작성해 줘.\n\n조건:\n- 진심 어린 사과\n- 해당 상담 건 확인 후 개선 약속\n- VIP 고객 감사 표현\n- 보상/혜택 안내 (적절한 수준으로)\n- 격식 있으면서 따뜻한 톤" },
    "PL관리": { from: "품질팀 박팀장", subject: "CBT-QSF 소음 클레임 증가 관련", body: "최근 3개월간 CBT-QSF 모델의 소음 관련 클레임이 전년 대비 40% 증가했습니다. PL 리스크 평가 요청드립니다.", prompt: "위 메일에 대한 답변을 작성해 줘.\n\n조건:\n- 데이터 확인 및 분석 일정 회신\n- 필요 자료 요청 (클레임 상세, 로트 정보 등)\n- PL 리스크 등급 평가 프로세스 안내\n- 유관부서 회의 제안" },
    "사무관리": { from: "협력업체 김과장", subject: "2월 납품 일정 지연 관련", body: "안녕하세요, 2월 예정된 필터 납품이 원자재 수급 문제로 1주일 지연될 예정입니다. 양해 부탁드립니다.", prompt: "위 메일에 대한 답변을 작성해 줘.\n\n조건:\n- 정중하지만 일정 준수의 중요성을 강조\n- 대안 일정을 요청\n- 지연에 따른 영향을 명시\n- 향후 재발 방지 요청" },
    "자재관리": { from: "거래처 한대리", subject: "필터 단가 인상 통보", body: "안녕하세요, 원자재 가격 상승으로 4월부터 필터 단가를 8% 인상하게 되었습니다. 양해 부탁드립니다.", prompt: "위 메일에 대한 답변을 작성해 줘.\n\n조건:\n- 인상 사유에 대한 상세 자료 요청\n- 인상 폭 협상 여지 제시\n- 타 거래처 견적 비교 가능성 언급\n- 장기 거래 관계를 고려한 정중한 톤" },
    "기타": { from: "유관부서 최대리", subject: "자료 협조 요청", body: "안녕하세요, 경영진 보고용으로 최근 3개월 실적 데이터가 필요합니다. 이번 주 금요일까지 전달 가능할까요?", prompt: "위 메일에 대한 답변을 작성해 줘.\n\n조건:\n- 협조 의사 표시\n- 제공 가능한 데이터 범위 확인\n- 전달 일정 회신\n- 필요 시 추가 정보 요청" },
  };

  // 업무별 ERP 데이터 검증 팁
  const ERP_TIPS = {
    "설치관리": [
      { icon: "📍", title: "설치 주소 정합성 체크", prompt: "이 설치 데이터에서 주소가 비어있거나 형식이 이상한 건을 찾아줘" },
      { icon: "⏱", title: "설치 소요시간 이상값 탐지", prompt: "설치 소요시간이 2시간 이상이거나 0인 비정상 건을 찾아줘" },
      { icon: "🔁", title: "중복 설치 예약 확인", prompt: "동일 주소에 같은 날짜로 중복 예약된 건이 있는지 확인해 줘" },
      { icon: "📦", title: "제품코드-모델명 매칭 확인", prompt: "제품코드와 모델명이 일치하지 않는 건을 찾아줘" },
    ],
    "수금관리": [
      { icon: "💰", title: "입금액-청구액 불일치 확인", prompt: "입금 금액과 청구 금액이 다른 건, 부분 입금 건을 모두 찾아줘" },
      { icon: "🔁", title: "중복 입금 탐지", prompt: "동일 고객번호로 같은 날짜에 중복 입금된 건이 있는지 확인해 줘" },
      { icon: "📅", title: "미수금 기간 분석", prompt: "미수금을 30일/60일/90일/180일 이상으로 구분해서 건수와 금액을 정리해 줘" },
      { icon: "⚠️", title: "계약 해지 후 청구 체크", prompt: "계약 해지일 이후에 청구가 발생한 비정상 건을 찾아줘" },
    ],
    "서비스관리": [
      { icon: "🔧", title: "부품코드 유효성 확인", prompt: "사용된 부품코드가 해당 제품 모델의 호환 부품인지 확인해 줘" },
      { icon: "⏱", title: "처리시간 이상값 분석", prompt: "서비스 접수 후 처리까지 7일 이상 걸린 건을 찾고 원인을 분류해 줘" },
      { icon: "🔁", title: "재접수 건 분석", prompt: "동일 고객이 같은 증상으로 30일 내 재접수한 건을 찾아줘" },
      { icon: "📊", title: "기사별 처리 효율 비교", prompt: "기사별 평균 처리시간, 재방문율, 고객 만족도를 비교 분석해 줘" },
    ],
    "컨택센터": [
      { icon: "📞", title: "미처리 콜 확인", prompt: "접수 후 24시간 이상 미처리 상태인 건을 긴급도 순으로 정리해 줘" },
      { icon: "🔁", title: "재문의 고객 분석", prompt: "같은 건으로 3회 이상 재문의한 고객을 찾고 미해결 이유를 분류해 줘" },
      { icon: "📊", title: "시간대별 인입량 분석", prompt: "시간대별 콜 인입량과 평균 대기시간을 분석해서 피크 시간을 알려줘" },
      { icon: "⭐", title: "상담 품질 점수 분석", prompt: "상담 만족도 3점 이하인 건을 추출하고 불만 유형을 분류해 줘" },
    ],
    "PL관리": [
      { icon: "📈", title: "클레임 추이 이상 감지", prompt: "특정 모델의 클레임이 전월 대비 30% 이상 증가한 항목을 찾아줘" },
      { icon: "🏭", title: "로트별 불량률 분석", prompt: "생산 로트별 불량률을 계산하고 기준치(0.5%)를 초과한 로트를 알려줘" },
      { icon: "🔍", title: "동일 부위 반복 하자 탐지", prompt: "같은 모델의 같은 부위에서 3건 이상 발생한 하자 패턴을 찾아줘" },
      { icon: "📋", title: "보증기간 내/외 구분", prompt: "클레임 데이터를 보증기간 내/외로 구분하고 각 비율과 처리 방법을 정리해 줘" },
    ],
    "사무관리": [
      { icon: "🔢", title: "경비 데이터 정합성", prompt: "이 경비 데이터에서 금액 합계가 맞지 않는 행, 날짜 오류, 빈 셀을 찾아줘" },
      { icon: "🔁", title: "중복 처리 탐지", prompt: "동일 건명으로 중복 기안/결재된 건이 있는지 확인해 줘" },
      { icon: "📊", title: "예산 집행률 분석", prompt: "부서별 예산 대비 집행률을 계산하고 초과/미달 항목을 정리해 줘" },
      { icon: "✅", title: "필수 항목 누락 체크", prompt: "이 데이터에서 필수 입력 항목(담당자, 일자, 금액)이 누락된 건을 찾아줘" },
    ],
    "자재관리": [
      { icon: "📦", title: "재고 수량 불일치 확인", prompt: "장부 재고와 실물 재고 데이터를 비교해서 차이가 나는 품목을 찾아줘" },
      { icon: "🔁", title: "중복 입출고 탐지", prompt: "동일 품목이 같은 날짜에 중복 입고/출고 처리된 건이 있는지 확인해 줘" },
      { icon: "📈", title: "소모량 이상 패턴 감지", prompt: "부품별 월평균 소모량 대비 이번 달 사용량이 50% 이상 차이나는 품목을 찾아줘" },
      { icon: "⏰", title: "납기 지연 예측", prompt: "발주 후 입고까지 소요일 데이터를 분석해서 평균보다 늦어지는 거래처를 알려줘" },
    ],
    "기타": [
      { icon: "🔢", title: "데이터 정합성 체크", prompt: "이 데이터에서 금액 합계가 맞지 않는 행, 날짜 형식 오류, 빈 셀을 찾아줘" },
      { icon: "🔁", title: "중복 데이터 탐지", prompt: "이 엑셀에서 동일한 키값으로 중복 입력된 건이 있는지 확인해 줘" },
      { icon: "📈", title: "이상값 탐지", prompt: "이 데이터에서 평균에서 크게 벗어나는 이상값을 찾고 원인을 추정해 줘" },
      { icon: "✅", title: "필수 항목 누락 체크", prompt: "이 데이터에서 필수 입력 항목이 누락된 건을 찾아줘" },
    ],
  };

  // 업무별 나만의 도구 MVP 추천
  const MVP_TOOLS = {
    "설치관리": [
      { title: "📍 설치 일정 배분 도구", desc: "기사별 지역/시간대를 고려한 일정 자동 배분", prompt: "설치 기사 이름, 담당 지역, 하루 가능 건수를 입력하면 설치 예정 건을 자동 배분해주는 HTML 도구를 만들어 줘" },
      { title: "✅ 설치 완료 체크리스트", desc: "현장에서 설치 후 점검 항목을 체크하는 모바일 폼", prompt: "정수기 설치 후 확인할 항목 15개(배관 연결, 누수 확인, 수질 테스트 등)를 체크하는 모바일 웹 체크리스트를 만들어 줘" },
      { title: "📊 설치 현황 대시보드", desc: "일별/기사별 설치 건수를 한눈에 보는 현황판", prompt: "날짜, 기사명, 설치 건수 데이터를 붙여넣으면 기사별/일별 차트를 보여주는 대시보드 HTML을 만들어 줘" },
    ],
    "수금관리": [
      { title: "💰 미수금 관리 대시보드", desc: "기간별/금액대별 미수금 현황을 시각화", prompt: "고객명, 미납금액, 미납일수 데이터를 붙여넣으면 30/60/90/180일 구간별로 분류하고 차트를 보여주는 HTML을 만들어 줘" },
      { title: "📱 독촉 문자 생성기", desc: "고객명과 금액을 넣으면 단계별 독촉 문자 자동 생성", prompt: "고객명과 미납금액을 입력하면 1단계(안내), 2단계(독촉), 3단계(최종통보) 문자를 자동 생성하는 웹 도구를 만들어 줘" },
      { title: "📋 수금 실적 입력 폼", desc: "매일 수금 실적을 간편하게 입력하고 누적 집계", prompt: "날짜, 고객명, 수금액, 수금방법을 입력하면 일별/월별 누적 합계를 자동 계산하는 입력 폼을 만들어 줘" },
    ],
    "서비스관리": [
      { title: "🔧 서비스 접수 분류기", desc: "증상을 입력하면 서비스 유형/긴급도를 자동 분류", prompt: "고객이 설명한 증상을 입력하면 서비스 유형(필터/부품/세척/점검)과 긴급도(상/중/하)를 분류해주는 웹 도구를 만들어 줘" },
      { title: "📦 부품 재고 추적기", desc: "부품 사용량 입력하면 재고 현황과 발주 필요량 계산", prompt: "부품명, 현재 재고, 일평균 사용량을 입력하면 예상 소진일과 발주 필요 시점을 알려주는 HTML 도구를 만들어 줘" },
      { title: "⭐ 서비스 만족도 집계기", desc: "만족도 점수를 입력하면 통계와 추이를 시각화", prompt: "날짜, 기사명, 만족도 점수(1~5)를 입력하면 기사별 평균, 전체 추이 차트를 보여주는 대시보드를 만들어 줘" },
    ],
    "컨택센터": [
      { title: "📞 상담 유형 분류기", desc: "상담 내용을 붙여넣으면 유형을 자동 태깅", prompt: "고객 상담 내용을 붙여넣으면 문의 유형(제품불만/배송/요금/해지/기타)을 자동 분류해주는 웹 도구를 만들어 줘" },
      { title: "📝 응대 스크립트 생성기", desc: "상황과 고객 감정을 선택하면 맞춤 스크립트 생성", prompt: "상황(제품불량/배송지연/요금문의), 고객감정(보통/불만/격앙)을 선택하면 맞춤 응대 스크립트를 생성하는 웹 도구를 만들어 줘" },
      { title: "📊 일일 상담 현황판", desc: "시간대별 인입량과 처리 현황을 실시간 표시", prompt: "시간대, 인입건수, 처리건수, 대기건수를 입력하면 시간대별 차트와 처리율을 보여주는 대시보드를 만들어 줘" },
    ],
    "PL관리": [
      { title: "📈 클레임 추이 모니터", desc: "모델별 클레임 건수 추이를 차트로 시각화", prompt: "월, 모델명, 클레임 건수 데이터를 붙여넣으면 모델별 추이 차트와 전월 대비 증감을 보여주는 대시보드를 만들어 줘" },
      { title: "⚠️ PL 리스크 평가 도구", desc: "발생빈도, 심각도를 입력하면 리스크 등급 자동 산출", prompt: "클레임 유형, 발생건수, 심각도(1~5)를 입력하면 리스크 매트릭스로 시각화하고 등급(상/중/하)을 매기는 도구를 만들어 줘" },
      { title: "📋 하자 패턴 분석기", desc: "클레임 데이터를 붙여넣으면 반복 패턴을 자동 탐지", prompt: "제품모델, 하자부위, 발생일 데이터를 붙여넣으면 동일 모델-부위 조합별 건수를 집계하고 상위 패턴을 알려주는 도구를 만들어 줘" },
    ],
    "사무관리": [
      { title: "📒 협력업체 주소록 검색기", desc: "ERP에 없는 업체 정보를 정리하고 검색", prompt: "협력업체 이름, 담당자, 연락처, 이메일을 입력하고 검색할 수 있는 HTML 페이지를 만들어 줘" },
      { title: "📊 일일 실적 입력 폼", desc: "매일 반복되는 실적 데이터를 쉽게 입력", prompt: "날짜, 지역, 건수, 금액을 입력하면 표로 정리해주는 HTML 도구를 만들어 줘" },
      { title: "📋 업무 요청 관리 보드", desc: "부서별 업무 요청을 접수/진행/완료로 관리", prompt: "요청자, 내용, 긴급도를 입력하면 접수→진행→완료 칸반보드로 관리하는 웹 도구를 만들어 줘" },
    ],
    "자재관리": [
      { title: "📦 재고 현황 대시보드", desc: "품목별 재고량과 발주 필요 시점을 한눈에", prompt: "부품명, 현재 재고, 안전재고, 일평균 사용량을 입력하면 재고 상태(정상/주의/긴급)를 색상으로 표시하고 예상 소진일을 보여주는 대시보드를 만들어 줘" },
      { title: "📋 발주 자동 계산기", desc: "사용량 기반 적정 발주량과 발주점 자동 산출", prompt: "부품별 월 사용량, 리드타임, 안전계수를 입력하면 적정 발주점(ROP)과 경제적 발주량(EOQ)을 자동 계산해주는 웹 도구를 만들어 줘" },
      { title: "🔍 부품 호환성 검색기", desc: "모델명으로 호환 부품을 바로 조회", prompt: "제품 모델명을 입력하면 호환되는 필터/부품 목록과 규격을 보여주는 검색 도구를 만들어 줘. 데이터는 직접 입력/관리할 수 있게" },
    ],
    "기타": [
      { title: "📒 업무 메모장", desc: "업무별 메모를 태그로 분류하고 검색", prompt: "제목, 내용, 태그를 입력해서 메모를 저장하고 태그별로 필터링/검색할 수 있는 웹 메모장을 만들어 줘" },
      { title: "📊 간단 데이터 시각화 도구", desc: "데이터를 붙여넣으면 차트를 자동 생성", prompt: "엑셀에서 복사한 데이터를 붙여넣으면 자동으로 막대/꺾은선/원형 차트를 생성해주는 HTML 도구를 만들어 줘" },
      { title: "📋 체크리스트 생성기", desc: "업무별 체크리스트를 만들고 진행률 확인", prompt: "할 일 항목을 입력하면 체크리스트로 만들어주고 진행률을 퍼센트로 보여주는 웹 도구를 만들어 줘" },
    ],
  };

  // 업무유형별 미션
  const MISSIONS = {
    DOC: [
      { level: "초급", color: "#10B981", badge: "🌱", mission: "AI에게 \"오늘 팀 회의 안건을 3개 정리해 줘\"라고 요청해 보기" },
      { level: "중급", color: "#F59E0B", badge: "🌿", mission: "실제로 작성해야 할 메일이나 공문 초안을 AI에게 요청해 보기" },
      { level: "고급", color: "#EF4444", badge: "🌳", mission: "기존에 작성한 보고서를 AI에게 주고 \"개선점을 알려줘\"라고 요청해 보기" },
    ],
    DATA: [
      { level: "초급", color: "#10B981", badge: "🌱", mission: "AI에게 \"VLOOKUP과 INDEX MATCH의 차이를 알려줘\"라고 물어보기" },
      { level: "중급", color: "#F59E0B", badge: "🌿", mission: "실제 엑셀 데이터(비식별)를 AI에 붙여넣고 \"요약 정리해 줘\"라고 요청해 보기" },
      { level: "고급", color: "#EF4444", badge: "🌳", mission: "ERP에서 뽑은 데이터의 오류를 AI로 찾아보고, 결과를 실제 업무에 적용해 보기" },
    ],
    SEARCH: [
      { level: "초급", color: "#10B981", badge: "🌱", mission: "Perplexity에서 \"정수기 필터 교체 주기 권장 기준\"을 검색해 보기" },
      { level: "중급", color: "#F59E0B", badge: "🌿", mission: "업무 중 확인이 필요한 규정이나 기준을 AI로 검색하고 출처를 확인해 보기" },
      { level: "고급", color: "#EF4444", badge: "🌳", mission: "경쟁사 정책을 AI로 비교 조사하고 표로 정리해 달라고 요청해 보기" },
    ],
    CS: [
      { level: "초급", color: "#10B981", badge: "🌱", mission: "AI에게 \"화난 고객을 진정시키는 3가지 방법\"을 물어보기" },
      { level: "중급", color: "#F59E0B", badge: "🌿", mission: "실제 고객 클레임 상황을 AI에게 설명하고 응대 스크립트를 받아보기" },
      { level: "고급", color: "#EF4444", badge: "🌳", mission: "일주일간의 VOC 내용을 AI에 넣고 유형별 분류 + 개선 제안을 받아보기" },
    ],
    COORD: [
      { level: "초급", color: "#10B981", badge: "🌱", mission: "AI에게 \"이번 주 할 일 5개를 우선순위로 정리해 줘\"라고 요청해 보기" },
      { level: "중급", color: "#F59E0B", badge: "🌿", mission: "최근 회의 내용을 메모 형태로 AI에 넣고 회의록으로 정리해 달라고 해보기" },
      { level: "고급", color: "#EF4444", badge: "🌳", mission: "프로젝트 업무를 AI에게 주고 담당자별 역할 분배 + 일정표를 만들어 보기" },
    ],
  };

  const EMAIL_EXAMPLE = EMAIL_EXAMPLES[job] || EMAIL_EXAMPLES["사무관리"];
  const erpTips = ERP_TIPS[job] || ERP_TIPS["사무관리"];
  const mvpTools = MVP_TOOLS[job] || MVP_TOOLS["사무관리"];
  const missions = MISSIONS[topType] || MISSIONS["DOC"];
  const jobPrompts = JOB_PROMPTS[job]?.[topType] || JOB_PROMPTS["사무관리"][topType] || [];
  const workflow = WORKFLOWS[job] || WORKFLOWS["사무관리"];

  const vis = (s) => ({ opacity: step >= s ? 1 : 0, transform: step >= s ? "translateY(0)" : "translateY(16px)", transition: "all 0.6s" });
  const sectionStyle = (s) => ({ ...vis(s), marginBottom: 16 });
  const cardBg = "rgba(30,41,59,0.6)";
  const cardBorder = "1px solid #334155";

  return (
    <div style={{ minHeight: "100vh", padding: "32px 20px", maxWidth: 520, margin: "0 auto", opacity: v ? 1 : 0, transition: "opacity 0.7s" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: "3rem", marginBottom: 8 }}>🎯</div>
        <h1 style={{ fontFamily: FN, fontSize: "1.6rem", fontWeight: 800, color: "#F1F5F9", marginBottom: 4 }}>{name}님의 업무 프로필</h1>
        <p style={{ color: "#64748B", fontSize: "0.85rem" }}>{job}</p>
      </div>

      {/* ===== 1. 레이더 차트 + 바 ===== */}
      <div style={{ ...sectionStyle(1), background: cardBg, borderRadius: 20, padding: "24px 16px", border: cardBorder }}>
        <h3 style={{ fontFamily: FN, fontSize: "0.9rem", fontWeight: 600, color: "#94A3B8", marginBottom: 16, textAlign: "center" }}>업무 유형 분석</h3>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <RadarChart data={Object.keys(TYPES).map(k => ({ type: TYPES[k].label.replace("형", ""), value: percents[k], fullMark: 100 }))}>
              <PolarGrid stroke="#334155" />
              <PolarAngleAxis dataKey="type" tick={{ fill: "#94A3B8", fontSize: 11, fontFamily: FN }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="value" stroke="#6366F1" fill="#6366F1" fillOpacity={0.3} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        {barData.map((d, i) => (
          <div key={d.key} style={{ display: "flex", alignItems: "center", marginBottom: 8, gap: 8 }}>
            <span style={{ fontSize: "0.78rem", color: "#94A3B8", minWidth: 88, fontFamily: FN, textAlign: "right" }}>{d.icon} {d.label}</span>
            <div style={{ flex: 1, height: 18, background: "#1E293B", borderRadius: 9, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${d.value}%`, background: d.color, borderRadius: 9, transition: "width 1s ease", transitionDelay: `${i * 150}ms` }} />
            </div>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: d.color, minWidth: 34 }}>{d.value}%</span>
          </div>
        ))}
      </div>

      {/* ===== 2. 업무 유형 설명 ===== */}
      <div style={{ ...sectionStyle(1), background: `linear-gradient(135deg, ${TYPES[topType].color}15, ${TYPES[secondType].color}10)`, borderRadius: 20, padding: 24, border: `1px solid ${TYPES[topType].color}40` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: "2.2rem" }}>{TYPES[topType].icon}</span>
          <div>
            <div style={{ fontFamily: FN, fontSize: "1.2rem", fontWeight: 700, color: TYPES[topType].color }}>{TYPES[topType].label}</div>
            <div style={{ color: "#94A3B8", fontSize: "0.8rem" }}>주요 업무 유형</div>
          </div>
        </div>
        <p style={{ color: "#CBD5E1", fontSize: "0.9rem", lineHeight: 1.6, fontFamily: FN }}>
          {TYPES[topType].desc}
          {percents[secondType] > 15 && (<><br/>부가적으로 <strong style={{ color: TYPES[secondType].color }}>{TYPES[secondType].label}</strong> 성향도 보입니다.</>)}
        </p>
      </div>

      {/* ===== 3. 추천 AI 도구 + 바로 접속 버튼 ===== */}
      <div style={sectionStyle(2)}>
        <h3 style={{ fontFamily: FN, fontSize: "1rem", fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>🏆 추천 AI 도구</h3>
        <div style={{ background: "rgba(30,41,59,0.8)", borderRadius: 16, padding: 20, marginBottom: 10, border: `2px solid ${pt.color}60` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "1.5rem" }}>{pt.logo}</span>
              <div>
                <div style={{ fontFamily: FN, fontWeight: 700, color: "#F1F5F9", fontSize: "1.1rem" }}>{pt.name}</div>
                <div style={{ color: "#64748B", fontSize: "0.75rem" }}>{pt.tagline}</div>
              </div>
            </div>
            <span style={{ background: `${pt.color}25`, color: pt.color, padding: "4px 12px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 600, fontFamily: FN }}>주력 추천</span>
          </div>
          <p style={{ color: "#94A3B8", fontSize: "0.82rem", marginBottom: 10, fontFamily: FN }}>💡 {match.reason}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {pt.strengths.map((s, i) => (
              <span key={i} style={{ background: "#1E293B", color: "#CBD5E1", padding: "4px 10px", borderRadius: 8, fontSize: "0.75rem", fontFamily: FN }}>{s}</span>
            ))}
          </div>
          <a href={TOOL_URLS[match.primary]} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", background: `${pt.color}`, color: "#fff", padding: "10px", borderRadius: 10, fontSize: "0.85rem", fontWeight: 600, fontFamily: FN, textDecoration: "none" }}>🔗 {pt.name} 바로 접속하기</a>
        </div>
        <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: 16, padding: "16px 20px", marginBottom: 0, border: cardBorder }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.2rem" }}>{st.logo}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FN, fontWeight: 600, color: "#CBD5E1", fontSize: "0.95rem" }}>{st.name}</div>
              <div style={{ color: "#64748B", fontSize: "0.75rem" }}>{st.tagline}</div>
            </div>
            <a href={TOOL_URLS[match.secondary]} target="_blank" rel="noopener noreferrer" style={{ color: "#94A3B8", fontSize: "0.7rem", fontFamily: FN, textDecoration: "underline" }}>접속 →</a>
          </div>
        </div>
      </div>

      {/* ===== 4. 업무별 맞춤 프롬프트 ===== */}
      <div style={{ ...sectionStyle(3), background: "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(59,130,246,0.1))", borderRadius: 16, padding: 20, border: "1px solid rgba(99,102,241,0.2)" }}>
        <h4 style={{ fontFamily: FN, fontWeight: 700, color: "#A5B4FC", fontSize: "0.9rem", marginBottom: 4 }}>📋 {job} × {TYPES[topType].label} 맞춤 프롬프트</h4>
        <p style={{ color: "#64748B", fontSize: "0.75rem", marginBottom: 14 }}>복사해서 AI에 바로 붙여넣어 보세요</p>
        {jobPrompts.map(([label, prompt], i) => (
          <div key={i} style={{ background: "rgba(15,23,42,0.6)", borderRadius: 10, padding: "12px 14px", marginBottom: 8, border: "1px solid #334155" }}>
            <div style={{ color: "#A5B4FC", fontSize: "0.78rem", fontWeight: 600, fontFamily: FN, marginBottom: 4 }}>{label}</div>
            <p style={{ color: "#CBD5E1", fontSize: "0.82rem", lineHeight: 1.6, fontFamily: FN, margin: 0 }}>"{prompt}"</p>
          </div>
        ))}
      </div>

      {/* ===== 5. 업무 워크플로우 ===== */}
      <div style={{ ...sectionStyle(4), background: cardBg, borderRadius: 16, padding: 20, border: cardBorder }}>
        <h4 style={{ fontFamily: FN, fontWeight: 700, color: "#F1F5F9", fontSize: "0.9rem", marginBottom: 14 }}>🔄 {job} AI 활용 워크플로우</h4>
        {workflow.map((w, i) => (
          <div key={i} style={{ display: "flex", gap: 12, marginBottom: i < workflow.length - 1 ? 0 : 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 32 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #3B82F6, #6366F1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.9rem" }}>{w.icon}</div>
              {i < workflow.length - 1 && <div style={{ width: 2, flex: 1, background: "#334155", margin: "4px 0" }} />}
            </div>
            <div style={{ paddingBottom: i < workflow.length - 1 ? 16 : 0 }}>
              <div style={{ fontFamily: FN, fontWeight: 600, color: "#E2E8F0", fontSize: "0.85rem" }}>{w.title}</div>
              <div style={{ color: "#94A3B8", fontSize: "0.78rem", lineHeight: 1.5 }}>{w.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ===== 6. 이메일 답변 예시 ===== */}
      <div style={{ ...sectionStyle(5), background: cardBg, borderRadius: 16, padding: 20, border: cardBorder }}>
        <h4 style={{ fontFamily: FN, fontWeight: 700, color: "#F1F5F9", fontSize: "0.9rem", marginBottom: 14 }}>📧 이메일 답변 자동 생성 활용법</h4>
        <div style={{ background: "#1E293B", borderRadius: 10, padding: 14, marginBottom: 10, border: "1px solid #475569" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
            <span style={{ color: "#64748B", fontSize: "0.72rem", fontFamily: FN }}>From:</span>
            <span style={{ color: "#CBD5E1", fontSize: "0.78rem", fontFamily: FN }}>{EMAIL_EXAMPLE.from}</span>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
            <span style={{ color: "#64748B", fontSize: "0.72rem", fontFamily: FN }}>제목:</span>
            <span style={{ color: "#CBD5E1", fontSize: "0.78rem", fontFamily: FN, fontWeight: 600 }}>{EMAIL_EXAMPLE.subject}</span>
          </div>
          <p style={{ color: "#94A3B8", fontSize: "0.78rem", lineHeight: 1.5, fontFamily: FN, margin: 0 }}>{EMAIL_EXAMPLE.body}</p>
        </div>
        <div style={{ color: "#A5B4FC", fontSize: "0.75rem", fontWeight: 600, marginBottom: 6, fontFamily: FN }}>↓ AI에게 이렇게 요청하세요</div>
        <div style={{ background: "rgba(99,102,241,0.1)", borderRadius: 10, padding: 14, border: "1px solid rgba(99,102,241,0.2)" }}>
          <p style={{ color: "#CBD5E1", fontSize: "0.8rem", lineHeight: 1.7, fontFamily: FN, margin: 0, whiteSpace: "pre-line" }}>{EMAIL_EXAMPLE.prompt}</p>
        </div>
      </div>

      {/* ===== 7. ERP 데이터 검증 팁 ===== */}
      <div style={{ ...sectionStyle(6), background: cardBg, borderRadius: 16, padding: 20, border: cardBorder }}>
        <h4 style={{ fontFamily: FN, fontWeight: 700, color: "#F1F5F9", fontSize: "0.9rem", marginBottom: 14 }}>🔍 {job} ERP 데이터 AI 검증 활용법</h4>
        <p style={{ color: "#94A3B8", fontSize: "0.82rem", lineHeight: 1.6, fontFamily: FN, marginBottom: 12 }}>ERP에서 추출한 엑셀 데이터를 AI에 업로드하면 사람이 놓치는 오류를 빠르게 찾아줍니다.</p>
        {erpTips.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: "1rem", marginTop: 2 }}>{item.icon}</span>
            <div>
              <div style={{ color: "#E2E8F0", fontSize: "0.82rem", fontWeight: 600, fontFamily: FN }}>{item.title}</div>
              <div style={{ color: "#94A3B8", fontSize: "0.76rem", fontFamily: FN, lineHeight: 1.5 }}>→ "{item.prompt}"</div>
            </div>
          </div>
        ))}
      </div>

      {/* ===== 8. 나만의 도구 만들기 ===== */}
      <div style={{ ...sectionStyle(7), background: "linear-gradient(135deg, rgba(245,158,11,0.1), rgba(239,68,68,0.05))", borderRadius: 16, padding: 20, border: "1px solid rgba(245,158,11,0.2)" }}>
        <h4 style={{ fontFamily: FN, fontWeight: 700, color: "#FCD34D", fontSize: "0.9rem", marginBottom: 6 }}>🛠 {job} 맞춤 업무 도구, AI로 만들 수 있습니다</h4>
        <p style={{ color: "#94A3B8", fontSize: "0.8rem", lineHeight: 1.6, fontFamily: FN, marginBottom: 14 }}>코딩을 몰라도 AI에게 설명만 하면 간단한 업무 도구를 만들어줍니다.</p>
        {mvpTools.map((item, i) => (
          <div key={i} style={{ background: "rgba(15,23,42,0.5)", borderRadius: 10, padding: 14, marginBottom: 8, border: "1px solid #334155" }}>
            <div style={{ color: "#FCD34D", fontSize: "0.82rem", fontWeight: 600, fontFamily: FN, marginBottom: 2 }}>{item.title}</div>
            <div style={{ color: "#94A3B8", fontSize: "0.76rem", fontFamily: FN, marginBottom: 6 }}>{item.desc}</div>
            <div style={{ color: "#CBD5E1", fontSize: "0.76rem", fontFamily: FN, background: "#1E293B", padding: "6px 10px", borderRadius: 6 }}>💬 "{item.prompt}"</div>
          </div>
        ))}
      </div>

      {/* ===== 9. 보안 주의사항 ===== */}
      <div style={{ ...sectionStyle(8), background: "rgba(239,68,68,0.08)", borderRadius: 16, padding: 20, border: "1px solid rgba(239,68,68,0.2)" }}>
        <h4 style={{ fontFamily: FN, fontWeight: 700, color: "#FCA5A5", fontSize: "0.9rem", marginBottom: 12 }}>⚠️ AI 사용 시 보안 주의사항</h4>
        {[
          { icon: "🚫", text: "고객 개인정보 (이름, 전화번호, 주소 등)를 AI에 입력하지 마세요" },
          { icon: "🔒", text: "사내 기밀 자료, 미공개 재무 데이터는 입력을 피하세요" },
          { icon: "👤", text: "개인정보가 포함된 데이터는 반드시 비식별 처리 후 사용하세요" },
          { icon: "🔄", text: "AI 결과물은 반드시 사람이 검토 후 사용하세요 (100% 신뢰 금지)" },
          { icon: "📌", text: "회사 정책에 따라 허용된 AI 도구만 업무에 사용하세요" },
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem" }}>{item.icon}</span>
            <span style={{ color: "#FCA5A5", fontSize: "0.8rem", fontFamily: FN, lineHeight: 1.4 }}>{item.text}</span>
          </div>
        ))}
      </div>

      {/* ===== 10. 오늘의 미션 ===== */}
      <div style={{ ...sectionStyle(8), background: cardBg, borderRadius: 16, padding: 20, border: cardBorder }}>
        <h4 style={{ fontFamily: FN, fontWeight: 700, color: "#F1F5F9", fontSize: "0.9rem", marginBottom: 14 }}>🎯 {TYPES[topType].label} 맞춤 오늘의 미션</h4>
        {missions.map((m, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10, background: `${m.color}10`, borderRadius: 10, padding: "12px 14px", border: `1px solid ${m.color}30` }}>
            <span style={{ fontSize: "1.5rem" }}>{m.badge}</span>
            <div>
              <div style={{ color: m.color, fontSize: "0.75rem", fontWeight: 700, fontFamily: FN }}>{m.level}</div>
              <div style={{ color: "#CBD5E1", fontSize: "0.82rem", fontFamily: FN, lineHeight: 1.5 }}>{m.mission}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ===== Bottom Buttons ===== */}
      <div style={{ display: "flex", gap: 10, marginBottom: 48 }}>
        <button onClick={onDashboard} style={{ flex: 1, background: "linear-gradient(135deg, #3B82F6, #8B5CF6)", border: "none", borderRadius: 12, padding: 14, color: "#fff", fontSize: "0.9rem", fontWeight: 600, fontFamily: FN, cursor: "pointer" }}>📊 전체 결과 보기</button>
        <button onClick={onRestart} style={{ flex: 1, background: "rgba(30,41,59,0.8)", border: "1px solid #334155", borderRadius: 12, padding: 14, color: "#94A3B8", fontSize: "0.9rem", fontFamily: FN, cursor: "pointer" }}>🔄 다시 하기</button>
      </div>
    </div>
  );
}

// ============ DASHBOARD ============

function Dashboard({ participants, onBack, loading }) {
  const [v, setV] = useState(false);
  const [filter, setFilter] = useState("전체");
  useEffect(() => { setTimeout(() => setV(true), 100); }, []);

  const jobs = ["전체", ...JOBS];
  const filtered = filter === "전체" ? participants : participants.filter(p => p.job === filter);

  const typeCounts = {};
  Object.keys(TYPES).forEach(k => { typeCounts[k] = 0; });
  participants.forEach(p => { typeCounts[calcProfile(p.scores).topType]++; });

  const toolCounts = {};
  Object.keys(TOOLS).forEach(k => { toolCounts[k] = 0; });
  participants.forEach(p => { toolCounts[TOOL_MATCH[calcProfile(p.scores).topType].primary]++; });

  return (
    <div style={{ minHeight: "100vh", padding: "32px 20px", maxWidth: 680, margin: "0 auto", opacity: v ? 1 : 0, transition: "opacity 0.5s" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: FN, fontSize: "1.4rem", fontWeight: 800, color: "#F1F5F9" }}>📊 설문 결과 대시보드</h1>
          <p style={{ color: "#64748B", fontSize: "0.82rem", marginTop: 4 }}>총 {participants.length}명 참여</p>
        </div>
        <button onClick={onBack} style={{ background: "rgba(30,41,59,0.8)", border: "1px solid #334155", borderRadius: 10, padding: "8px 16px", color: "#94A3B8", fontSize: "0.8rem", fontFamily: FN, cursor: "pointer" }}>← 돌아가기</button>
      </div>

      {participants.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
          <div style={{ background: "rgba(30,41,59,0.6)", borderRadius: 14, padding: 16, border: "1px solid #334155" }}>
            <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: 10, fontFamily: FN }}>업무 유형 분포</div>
            {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([k, count]) => count > 0 && (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: "0.7rem", width: 16 }}>{TYPES[k].icon}</span>
                <div style={{ flex: 1, height: 10, background: "#1E293B", borderRadius: 5, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(count / participants.length) * 100}%`, background: TYPES[k].color, borderRadius: 5 }} />
                </div>
                <span style={{ color: TYPES[k].color, fontSize: "0.72rem", fontWeight: 600, minWidth: 18 }}>{count}</span>
              </div>
            ))}
          </div>
          <div style={{ background: "rgba(30,41,59,0.6)", borderRadius: 14, padding: 16, border: "1px solid #334155" }}>
            <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: 10, fontFamily: FN }}>추천 도구 분포</div>
            {Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).map(([k, count]) => count > 0 && (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: "0.7rem", width: 16 }}>{TOOLS[k].logo}</span>
                <span style={{ color: "#CBD5E1", fontSize: "0.7rem", fontFamily: FN, minWidth: 56 }}>{TOOLS[k].name}</span>
                <div style={{ flex: 1, height: 10, background: "#1E293B", borderRadius: 5, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(count / participants.length) * 100}%`, background: TOOLS[k].color, borderRadius: 5 }} />
                </div>
                <span style={{ color: TOOLS[k].color, fontSize: "0.72rem", fontWeight: 600, minWidth: 18 }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {jobs.map(j => (
          <button key={j} onClick={() => setFilter(j)}
            style={{ background: filter === j ? "linear-gradient(135deg, #3B82F6, #6366F1)" : "rgba(30,41,59,0.6)", border: filter === j ? "1px solid #6366F1" : "1px solid #334155", borderRadius: 20, padding: "6px 14px", color: filter === j ? "#fff" : "#94A3B8", fontSize: "0.78rem", fontFamily: FN, cursor: "pointer", transition: "all 0.2s" }}>{j}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#64748B" }}>
          <p style={{ fontFamily: FN }}>데이터 불러오는 중...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#64748B" }}>
          <div style={{ fontSize: "3rem", marginBottom: 16 }}>📋</div>
          <p style={{ fontFamily: FN, fontSize: "1rem" }}>{participants.length === 0 ? "아직 참여자가 없습니다" : "해당 업무에 참여자가 없습니다"}</p>
          <p style={{ fontSize: "0.85rem", marginTop: 8 }}>설문을 완료하면 여기에 표시됩니다</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
          {filtered.map((p, idx) => {
            const { percents, topType, sorted } = calcProfile(p.scores);
            const m = TOOL_MATCH[topType];
            return (
              <div key={p.id || idx} style={{ background: "rgba(30,41,59,0.6)", borderRadius: 16, padding: 16, border: "1px solid #334155", display: "flex", gap: 12, alignItems: "center" }}>
                <MiniRadar scores={p.scores} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: FN, fontWeight: 700, color: "#F1F5F9", fontSize: "1rem" }}>{p.name}</span>
                    <span style={{ background: "#1E293B", color: "#94A3B8", padding: "2px 8px", borderRadius: 6, fontSize: "0.7rem", fontFamily: FN }}>{p.job}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: "0.85rem" }}>{TYPES[topType].icon}</span>
                    <span style={{ color: TYPES[topType].color, fontWeight: 600, fontSize: "0.85rem", fontFamily: FN }}>{TYPES[topType].label}</span>
                    <span style={{ color: "#475569", fontSize: "0.75rem" }}>{percents[topType]}%</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ background: `${TOOLS[m.primary].color}20`, color: TOOLS[m.primary].color, padding: "2px 8px", borderRadius: 6, fontSize: "0.7rem", fontWeight: 600, fontFamily: FN }}>{TOOLS[m.primary].logo} {TOOLS[m.primary].name}</span>
                    <span style={{ background: "#1E293B", color: "#64748B", padding: "2px 8px", borderRadius: 6, fontSize: "0.7rem", fontFamily: FN }}>{TOOLS[m.secondary].logo} {TOOLS[m.secondary].name}</span>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 3, height: 4, borderRadius: 2, overflow: "hidden" }}>
                    {sorted.map(([k, val]) => (
                      <div key={k} style={{ width: `${val}%`, background: TYPES[k].color, minWidth: val > 0 ? 3 : 0 }} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============ APP ============

export default function App() {
  const [phase, setPhase] = useState("welcome");
  const [name, setName] = useState("");
  const [job, setJob] = useState("");
  const [currentQ, setCurrentQ] = useState(0);
  const [scores, setScores] = useState({ DOC: 0, DATA: 0, SEARCH: 0, CS: 0, COORD: 0 });
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadParticipants = useCallback(async () => {
    setLoading(true);
    const data = await getResults();
    setParticipants(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadParticipants(); }, [loadParticipants]);

  const handleSelect = async (selectedIndices) => {
    const q = QUESTIONS[currentQ];
    let newScores = { ...scores };

    if (q.isInfo) {
      setJob(q.options[selectedIndices[0]].text);
    } else {
      selectedIndices.forEach((optIdx, rank) => {
        const optScores = q.options[optIdx].scores;
        const multiplier = rank === 0 ? 1 : 0.5;
        Object.entries(optScores).forEach(([k, v]) => {
          newScores[k] = (newScores[k] || 0) + Math.round(v * multiplier * 10) / 10;
        });
      });
      setScores(newScores);
    }

    if (currentQ < QUESTIONS.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      const entry = { name, job: job || "", scores: newScores };
      await saveResult(entry);
      await loadParticipants();
      setPhase("result");
    }
  };

  const reset = () => { setPhase("welcome"); setName(""); setJob(""); setCurrentQ(0); setScores({ DOC: 0, DATA: 0, SEARCH: 0, CS: 0, COORD: 0 }); };

  const goToDashboard = () => { loadParticipants(); setPhase("dashboard"); };

  return (
    <div style={{ background: "#0F172A", minHeight: "100vh" }}>
      {phase === "welcome" && <WelcomeScreen onStart={() => setPhase("name")} onDashboard={goToDashboard} participantCount={participants.length} />}
      {phase === "name" && <NameInput onSubmit={(n) => { setName(n); setPhase("survey"); setCurrentQ(0); setScores({ DOC: 0, DATA: 0, SEARCH: 0, CS: 0, COORD: 0 }); }} />}
      {phase === "survey" && <QuestionScreen question={QUESTIONS[currentQ]} index={currentQ} total={QUESTIONS.length} onSelect={handleSelect} />}
      {phase === "result" && <ResultScreen name={name} job={job} scores={scores} onDashboard={goToDashboard} onRestart={reset} />}
      {phase === "dashboard" && <Dashboard participants={participants} onBack={reset} loading={loading} />}
    </div>
  );
}
