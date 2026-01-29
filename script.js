const numbersEl = document.getElementById("numbers");
const historyList = document.getElementById("historyList");
const generateBtn = document.getElementById("generateBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const uniqueOnlyCheckbox = document.getElementById("uniqueOnly");
const sortAscCheckbox = document.getElementById("sortAsc");
const useAnalysisCheckbox = document.getElementById("useAnalysis");
const analysisRangeSelect = document.getElementById("analysisRange");
const analysisStatus = document.getElementById("analysisStatus");

const MAX_NUM = 45;
const PICK_COUNT = 6;
const SET_COUNT = 5;
const history = [];
const analysisState = {
  status: "idle",
  weights: null,
  range: null,
  latest: null,
};

const getBallClass = (num) => {
  if (num <= 10) return "yellow";
  if (num <= 20) return "blue";
  if (num <= 30) return "red";
  if (num <= 40) return "gray";
  return "green";
};

const renderNumbers = (tickets) => {
  numbersEl.innerHTML = "";
  if (!tickets || tickets.length === 0) {
    numbersEl.innerHTML = '<span class="placeholder">번호를 생성해 주세요</span>';
    return;
  }

  tickets.forEach((ticket, idx) => {
    const row = document.createElement("div");
    row.className = "ticket";
    row.setAttribute("aria-label", `추천 ${idx + 1}번째 게임`);

    const label = document.createElement("span");
    label.className = "ticket-label";
    label.textContent = `게임 ${idx + 1}`;
    row.appendChild(label);

    ticket.main.forEach((num) => {
      const ball = document.createElement("span");
      ball.className = `ball ${getBallClass(num)}`;
      ball.textContent = num;
      row.appendChild(ball);
    });

    const bonusLabel = document.createElement("span");
    bonusLabel.className = "bonus-label";
    bonusLabel.textContent = "+보너스";
    row.appendChild(bonusLabel);

    const bonusBall = document.createElement("span");
    bonusBall.className = `ball ${getBallClass(ticket.bonus)}`;
    bonusBall.textContent = ticket.bonus;
    row.appendChild(bonusBall);

    numbersEl.appendChild(row);
  });
};

const renderHistory = () => {
  historyList.innerHTML = "";
  if (history.length === 0) {
    historyList.innerHTML = '<li class="placeholder">아직 기록이 없어요.</li>';
    return;
  }

  history
    .slice()
    .reverse()
    .forEach((tickets, idx) => {
      const item = document.createElement("li");
      item.className = "history-item";
      item.setAttribute("aria-label", `추천 기록 ${history.length - idx}번째`);
      tickets.forEach((ticket, ticketIdx) => {
        const row = document.createElement("div");
        row.className = "ticket";

        const label = document.createElement("span");
        label.className = "ticket-label";
        label.textContent = `게임 ${ticketIdx + 1}`;
        row.appendChild(label);

        ticket.main.forEach((num) => {
          const ball = document.createElement("span");
          ball.className = `ball ${getBallClass(num)}`;
          ball.textContent = num;
          row.appendChild(ball);
        });

        const bonusLabel = document.createElement("span");
        bonusLabel.className = "bonus-label";
        bonusLabel.textContent = "+보너스";
        row.appendChild(bonusLabel);

        const bonusBall = document.createElement("span");
        bonusBall.className = `ball ${getBallClass(ticket.bonus)}`;
        bonusBall.textContent = ticket.bonus;
        row.appendChild(bonusBall);

        item.appendChild(row);
      });
      historyList.appendChild(item);
    });
};

const updateAnalysisStatus = (text, isError = false) => {
  analysisStatus.textContent = text;
  analysisStatus.classList.toggle("error", isError);
};

const fetchLatestDraw = async () => {
  const response = await fetch(
    "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=0"
  );
  const data = await response.json();
  if (data.returnValue !== "success" || !data.drwNo) {
    throw new Error("latest fetch failed");
  }
  return data.drwNo;
};

const fetchDraw = async (drawNo) => {
  const response = await fetch(
    `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${drawNo}`
  );
  const data = await response.json();
  if (data.returnValue !== "success") {
    throw new Error("draw fetch failed");
  }

  return {
    main: [
      data.drwtNo1,
      data.drwtNo2,
      data.drwtNo3,
      data.drwtNo4,
      data.drwtNo5,
      data.drwtNo6,
    ],
    bonus: data.bnusNo,
  };
};

const fetchDraws = async (latest, count) => {
  const draws = [];
  const batchSize = 8;
  for (let start = latest; start > 0 && draws.length < count; start -= batchSize) {
    const batch = [];
    for (
      let no = start;
      no > start - batchSize && no > 0 && draws.length + batch.length < count;
      no -= 1
    ) {
      batch.push(
        fetchDraw(no).catch(() => null)
      );
    }
    const results = await Promise.all(batch);
    results.filter(Boolean).forEach((draw) => draws.push(draw));
  }
  return draws;
};

const buildWeights = (draws) => {
  const weights = Array.from({ length: MAX_NUM + 1 }, () => 0);
  draws.forEach((draw) => {
    draw.main.forEach((num) => {
      weights[num] += 1;
    });
    if (draw.bonus) {
      weights[draw.bonus] += 0.5;
    }
  });
  for (let i = 1; i <= MAX_NUM; i += 1) {
    weights[i] += 1;
  }
  return weights;
};

const ensureAnalysis = async () => {
  if (!useAnalysisCheckbox.checked) {
    updateAnalysisStatus("분석 사용 안 함");
    return null;
  }

  const range = Number(analysisRangeSelect.value);
  if (analysisState.weights && analysisState.range === range) {
    return analysisState.weights;
  }

  updateAnalysisStatus("최근 회차 분석 중...");
  analysisState.status = "loading";

  try {
    const latest = analysisState.latest || (await fetchLatestDraw());
    analysisState.latest = latest;
    const draws = await fetchDraws(latest, range);
    if (draws.length === 0) {
      throw new Error("no draws");
    }
    analysisState.weights = buildWeights(draws);
    analysisState.range = range;
    analysisState.status = "ready";
    updateAnalysisStatus(`최근 ${draws.length}회 분석 완료`);
    return analysisState.weights;
  } catch (error) {
    analysisState.status = "error";
    analysisState.weights = null;
    updateAnalysisStatus("분석 실패, 랜덤으로 추천합니다.", true);
    return null;
  }
};

const weightedPick = (weights, count, exclude = []) => {
  const picked = [];
  const excluded = new Set(exclude);
  for (let i = 0; i < count; i += 1) {
    let total = 0;
    for (let num = 1; num <= MAX_NUM; num += 1) {
      if (!excluded.has(num)) {
        total += weights[num];
      }
    }
    let target = Math.random() * total;
    let chosen = 1;
    for (let num = 1; num <= MAX_NUM; num += 1) {
      if (excluded.has(num)) {
        continue;
      }
      target -= weights[num];
      if (target <= 0) {
        chosen = num;
        break;
      }
    }
    picked.push(chosen);
    excluded.add(chosen);
  }
  return picked;
};

const weightedPickWithReplacement = (weights, count) => {
  const picked = [];
  const total = weights.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < count; i += 1) {
    let target = Math.random() * total;
    let chosen = 1;
    for (let num = 1; num <= MAX_NUM; num += 1) {
      target -= weights[num];
      if (target <= 0) {
        chosen = num;
        break;
      }
    }
    picked.push(chosen);
  }
  return picked;
};

const pickTicket = (weights) => {
  const uniqueOnly = uniqueOnlyCheckbox.checked;
  const useWeights = Array.isArray(weights);
  let main = [];

  if (useWeights) {
    main = uniqueOnly
      ? weightedPick(weights, PICK_COUNT)
      : weightedPickWithReplacement(weights, PICK_COUNT);
  } else {
    while (main.length < PICK_COUNT) {
      const num = Math.floor(Math.random() * MAX_NUM) + 1;
      if (uniqueOnly && main.includes(num)) {
        continue;
      }
      main.push(num);
    }
  }

  if (sortAscCheckbox.checked) {
    main.sort((a, b) => a - b);
  }

  let bonus = Math.floor(Math.random() * MAX_NUM) + 1;
  if (useWeights) {
    [bonus] = weightedPick(weights, 1, main);
  } else {
    while (main.includes(bonus)) {
      bonus = Math.floor(Math.random() * MAX_NUM) + 1;
    }
  }

  return { main, bonus };
};

const pickTickets = (weights) => {
  const tickets = [];
  for (let i = 0; i < SET_COUNT; i += 1) {
    tickets.push(pickTicket(weights));
  }
  return tickets;
};

const generateNumbers = async () => {
  generateBtn.disabled = true;
  try {
    const weights = await ensureAnalysis();
    const tickets = pickTickets(weights);
    renderNumbers(tickets);
    history.push(tickets);
    renderHistory();
  } finally {
    generateBtn.disabled = false;
  }
};

const shuffleNumbers = () => {
  const currentTickets = history[history.length - 1];
  if (!currentTickets) {
    generateNumbers();
    return;
  }
  const shuffledTickets = currentTickets.map((ticket) => ({
    ...ticket,
    main: [...ticket.main].sort(() => Math.random() - 0.5),
  }));
  renderNumbers(shuffledTickets);
};

const clearHistory = () => {
  history.length = 0;
  renderHistory();
  renderNumbers([]);
};

generateBtn.addEventListener("click", () => {
  generateNumbers();
});
shuffleBtn.addEventListener("click", shuffleNumbers);
clearHistoryBtn.addEventListener("click", clearHistory);
useAnalysisCheckbox.addEventListener("change", () => {
  analysisState.weights = null;
  analysisState.range = null;
  if (!useAnalysisCheckbox.checked) {
    updateAnalysisStatus("분석 사용 안 함");
  } else {
    updateAnalysisStatus("분석 대기 중");
  }
});
analysisRangeSelect.addEventListener("change", () => {
  analysisState.weights = null;
  analysisState.range = null;
  if (useAnalysisCheckbox.checked) {
    updateAnalysisStatus("분석 대기 중");
  }
});

renderNumbers([]);
renderHistory();
updateAnalysisStatus("분석 대기 중");
