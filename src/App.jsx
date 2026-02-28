import React, { useEffect, useMemo, useState } from "react";

const VALUE_LEVELS = [200, 400, 600, 800, 1000];
const ROUND_NAME = "Jeopardy!";
const DATA_URL = `${import.meta.env.BASE_URL}JEOPARDY_CSV.csv`;

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (char === "\r") {
        continue;
      } else {
        field += char;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeValue(value) {
  if (!value) return null;
  const cleaned = value.replace(/[$,]/g, "");
  const numeric = Number.parseInt(cleaned, 10);
  return Number.isNaN(numeric) ? null : numeric;
}

function buildGame(rows) {
  const [header, ...data] = rows;
  const colIndex = header.reduce((acc, name, idx) => {
    acc[name.trim()] = idx;
    return acc;
  }, {});

  const clues = data
    .map((row) => ({
      category: row[colIndex["Category"]],
      value: normalizeValue(row[colIndex["Value"]]),
      question: row[colIndex["Question"]],
      answer: row[colIndex["Answer"]],
      round: row[colIndex["Round"]]
    }))
    .filter(
      (clue) =>
        clue.round === ROUND_NAME &&
        clue.category &&
        clue.value &&
        clue.question &&
        clue.answer
    );

  const categoryMap = new Map();
  for (const clue of clues) {
    if (!categoryMap.has(clue.category)) {
      categoryMap.set(clue.category, []);
    }
    categoryMap.get(clue.category).push(clue);
  }

  const eligible = Array.from(categoryMap.entries()).filter(([, items]) => {
    const values = new Set(items.map((item) => item.value));
    return VALUE_LEVELS.every((value) => values.has(value));
  });

  const shuffled = eligible.sort(() => Math.random() - 0.5);
  const chosen = shuffled.slice(0, 6);

  const categories = chosen.map(([name, items]) => {
    const byValue = new Map();
    for (const item of items) {
      if (VALUE_LEVELS.includes(item.value) && !byValue.has(item.value)) {
        byValue.set(item.value, item);
      }
    }
    return {
      name,
      clues: VALUE_LEVELS.map((value) => ({
        ...byValue.get(value),
        id: `${name}|${value}`
      }))
    };
  });

  return categories;
}

function formatValue(value) {
  return value ? `$${value}` : "-";
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [game, setGame] = useState([]);
  const [allClues, setAllClues] = useState([]);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [answered, setAnswered] = useState({});
  const [score, setScore] = useState(0);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState([]);
  const [selectedChoice, setSelectedChoice] = useState("");
  const [answerResult, setAnswerResult] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(DATA_URL);
        const text = await response.text();
        const parsed = parseCSV(text);
        setRows(parsed);
        const clues = buildClueList(parsed);
        setAllClues(clues);
        const newGame = buildGame(parsed);
        if (newGame.length < 6) {
          setError("Not enough categories to build a full board.");
        }
        setGame(newGame);
      } catch (err) {
        setError("Failed to load CSV data.");
      }
    }
    load();
  }, []);

  const boardReady = useMemo(() => game.length === 6, [game]);

  function buildClueList(dataRows) {
    const [header, ...data] = dataRows;
    const colIndex = header.reduce((acc, name, idx) => {
      acc[name.trim()] = idx;
      return acc;
    }, {});
    return data
      .map((row) => ({
        category: row[colIndex["Category"]],
        value: normalizeValue(row[colIndex["Value"]]),
        question: row[colIndex["Question"]],
        answer: row[colIndex["Answer"]],
        round: row[colIndex["Round"]]
      }))
      .filter((clue) => clue.category && clue.answer && clue.question);
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function buildChoices(correctClue) {
    const normalizedCorrect = normalizeAnswer(correctClue.answer);
    const sameCategory = allClues.filter(
      (clue) =>
        clue.category === correctClue.category &&
        normalizeAnswer(clue.answer) !== normalizedCorrect
    );
    const pool = sameCategory.length >= 3 ? sameCategory : allClues;
    const unique = new Map();
    for (const clue of pool) {
      const normalized = normalizeAnswer(clue.answer);
      if (!normalized || normalized === normalizedCorrect) continue;
      if (!unique.has(normalized)) {
        unique.set(normalized, clue.answer);
      }
      if (unique.size >= 20) break;
    }
    const distractors = shuffle(Array.from(unique.values())).slice(0, 3);
    const options = shuffle([correctClue.answer, ...distractors]);
    setChoices(options);
  }

  function startNewGame() {
    if (!rows.length) return;
    const nextGame = buildGame(rows);
    setGame(nextGame);
    setSelected(null);
    setRevealed(false);
    setAnswered({});
    setScore(0);
    setError(nextGame.length < 6 ? "Not enough categories to build a full board." : "");
    setChoices([]);
    setSelectedChoice("");
    setAnswerResult(null);
  }

  function openClue(clue) {
    if (!clue || !clue.question) return;
    if (answered[clue.id]) return;
    setSelected(clue);
    setRevealed(false);
    setSelectedChoice("");
    setAnswerResult(null);
    buildChoices(clue);
  }

  function normalizeAnswer(text) {
    return text
      .toLowerCase()
      .replace(/<[^>]*>/g, "")
      .replace(/["'`]/g, "")
      .replace(/\b(a|an|the)\b/g, "")
      .replace(/[^a-z0-9]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function checkAnswer() {
    if (!selected) return;
    if (answered[selected.id]) return;
    const cleanedUser = normalizeAnswer(selectedChoice);
    const cleanedCorrect = normalizeAnswer(selected.answer);
    if (!cleanedUser) {
      setAnswerResult("Pick an answer to check.");
      return;
    }
    const isMatch = cleanedUser === cleanedCorrect;
    setAnswerResult(isMatch ? "Correct!" : "Not quite.");
    setAnswered((prev) => ({
      ...prev,
      [selected.id]: true
    }));
    setScore((prev) => prev + (isMatch ? selected.value : -selected.value));
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-text">
          <div className="hero-badge">Game Show</div>
          <h1 className="hero-title">Jeopardy!</h1>
          <p className="hero-subtitle">Trivia Challenge</p>
          <p className="subhead">
            Click a dollar value to open a clue, reveal the answer, and track your score.
          </p>
        </div>
        <div className="hero-actions">
          <button className="primary" onClick={startNewGame}>
            Start Game!
          </button>
          <div className="score">
            <span>Score</span>
            <strong>{score}</strong>
          </div>
        </div>
      </header>

      {error && <div className="banner">{error}</div>}

      <section className={`board ${boardReady ? "" : "board--loading"}`}>
        <div className="board-grid">
          {game.map((category) => (
            <div key={category.name} className="board-col">
              <div className="category">{category.name}</div>
              {category.clues.map((clue) => (
                <button
                  key={clue.id}
                  className={`clue ${answered[clue.id] ? "clue--used" : ""}`}
                  onClick={() => openClue(clue)}
                  disabled={answered[clue.id]}
                >
                  {formatValue(clue?.value)}
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>

      {selected && (
        <div className="modal">
          <div className="modal-card">
            <div className="modal-header">
              <span>{selected.category}</span>
              <strong>{formatValue(selected.value)}</strong>
            </div>
            <div className="modal-body">
              <p className="question">{selected.question}</p>
              {revealed && <p className="answer">{selected.answer}</p>}
              <div className="answer-input">
                <label>Choose Your Answer</label>
                <div className="choices">
                  {choices.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      className={`choice ${selectedChoice === choice ? "choice--selected" : ""}`}
                      onClick={() => setSelectedChoice(choice)}
                      disabled={answered[selected.id]}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
                <div className={`answer-result ${answerResult ? "" : "answer-result--empty"}`}>
                  {answerResult || " "}
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setRevealed((prev) => !prev)}>
                {revealed ? "Hide Answer" : "Reveal Answer"}
              </button>
              <button
                className="secondary"
                onClick={checkAnswer}
                disabled={answered[selected.id]}
              >
                Lock In Answer
              </button>
            </div>
            <button className="close" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
