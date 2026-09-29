/**
 * ============================================================================
 * AETHERWARD: SKYBORNE SIGILS - Rush Mode Arcade Leaderboard (js/leaderboard.js)
 * ============================================================================
 * Self-contained local persistence module for Rush Mode arcade records.
 * Designed with a clean repository interface so localStorage can easily be
 * swapped for a remote REST/Firebase/Supabase backend in the future.
 */

window.Aetherward = window.Aetherward || {};

(function () {
  const RUSH_SCORES_STORAGE_KEY = 'aetherward_rush_leaderboard_v1';
  const RUSH_LAST_NAME_KEY = 'aetherward_rush_last_player_v1';
  const MAX_LEADERBOARD_ENTRIES = 20;
  const DEFAULT_PLAYER_NAME = 'PLAYER';

  /**
   * Formats seconds into MM:SS string (e.g., 84 -> "01:24").
   */
  function formatTimeMMSS(seconds) {
    const safeSec = Math.max(0, Math.floor(Number(seconds) || 0));
    const mins = Math.floor(safeSec / 60);
    const secs = safeSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Sanitizes a player name to classic arcade format (3-12 chars, defaults to PLAYER).
   */
  function sanitizePlayerName(rawName) {
    if (typeof rawName !== 'string') return DEFAULT_PLAYER_NAME;
    const cleaned = rawName.trim().replace(/\s+/g, ' ').slice(0, 12).toUpperCase();
    return cleaned.length > 0 ? cleaned : DEFAULT_PLAYER_NAME;
  }

  /**
   * Loads the most recently used player name from localStorage.
   */
  function getLastPlayerName() {
    try {
      const saved = localStorage.getItem(RUSH_LAST_NAME_KEY);
      return saved ? sanitizePlayerName(saved) : '';
    } catch (e) {
      return '';
    }
  }

  /**
   * Saves the most recently used player name to localStorage.
   */
  function saveLastPlayerName(name) {
    const sanitized = sanitizePlayerName(name);
    try {
      localStorage.setItem(RUSH_LAST_NAME_KEY, sanitized);
    } catch (e) {
      // Ignore storage quota errors
    }
    return sanitized;
  }

  /**
   * Sorts Rush Mode records primarily by Score (descending),
   * secondarily by Overtime Survival Time (descending),
   * and tertiarily by Total Match Time (descending).
   */
  function sortRushScores(records) {
    if (!Array.isArray(records)) return [];
    return records.slice().sort((a, b) => {
      const scoreDiff = (Number(b.score) || 0) - (Number(a.score) || 0);
      if (scoreDiff !== 0) return scoreDiff;

      const otDiff = (Number(b.overtimeSeconds) || 0) - (Number(a.overtimeSeconds) || 0);
      if (otDiff !== 0) return otDiff;

      return (Number(b.totalMatchSeconds) || 0) - (Number(a.totalMatchSeconds) || 0);
    });
  }

  /**
   * Loads all saved Rush Mode records from localStorage, sorted by rank.
   */
  function loadRushScores() {
    try {
      const raw = localStorage.getItem(RUSH_SCORES_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return sortRushScores(parsed).slice(0, MAX_LEADERBOARD_ENTRIES);
    } catch (e) {
      return [];
    }
  }

  /**
   * Saves a completed Rush Mode run into the local leaderboard database.
   * Allows duplicate player names (every completed game creates its own record).
   *
   * @param {Object} params
   * @returns {{
   *   record: Object,
   *   rank: number|null,
   *   isNewHighScore: boolean,
   *   madeLeaderboard: boolean,
   *   leaderboard: Array
   * }}
   */
  function saveRushScore({
    playerName,
    score,
    overtimeSeconds = 0,
    totalMatchSeconds = 0,
    highestCombo = 0,
    accuracy = 100,
    date = null
  }) {
    const existing = loadRushScores();
    const previousHigh = existing.length > 0 ? existing[0].score : 0;

    const now = new Date();
    const formattedDate = date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const newRecord = {
      id: `rush_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      playerName: sanitizePlayerName(playerName),
      score: Math.max(0, Math.floor(Number(score) || 0)),
      overtimeSeconds: Math.max(0, Math.floor(Number(overtimeSeconds) || 0)),
      totalMatchSeconds: Math.max(0, Math.floor(Number(totalMatchSeconds) || 0)),
      highestCombo: Math.max(0, Math.floor(Number(highestCombo) || 0)),
      accuracy: Math.max(0, Math.min(100, Math.round(Number(accuracy) || 0))),
      date: formattedDate
    };

    const combined = sortRushScores([...existing, newRecord]);
    const rankIndex = combined.findIndex(r => r.id === newRecord.id);
    const madeLeaderboard = rankIndex !== -1 && rankIndex < MAX_LEADERBOARD_ENTRIES;
    const rank = madeLeaderboard ? rankIndex + 1 : null;
    const isNewHighScore = newRecord.score > 0 && (
      newRecord.score > previousHigh ||
      (newRecord.score === previousHigh && rank === 1)
    );

    const trimmed = combined.slice(0, MAX_LEADERBOARD_ENTRIES);

    try {
      localStorage.setItem(RUSH_SCORES_STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      // Ignore storage quota errors
    }

    return {
      record: newRecord,
      rank,
      isNewHighScore,
      madeLeaderboard,
      leaderboard: trimmed
    };
  }

  /**
   * Returns the highest score recorded in Rush Mode (or 0 if empty).
   */
  function getRushHighScore() {
    const scores = loadRushScores();
    return scores.length > 0 ? scores[0].score : 0;
  }

  /**
   * Returns the longest Overtime survival time (in seconds) recorded in Rush Mode.
   */
  function getRushBestOvertime() {
    const scores = loadRushScores();
    let bestOT = 0;
    for (const s of scores) {
      if ((s.overtimeSeconds || 0) > bestOT) {
        bestOT = s.overtimeSeconds;
      }
    }
    return bestOT;
  }

  /**
   * Completely clears all Rush Mode leaderboard records, Rush high scores,
   * and Rush overtime records without touching unrelated game settings.
   */
  function clearRushScores() {
    try {
      localStorage.removeItem(RUSH_SCORES_STORAGE_KEY);
    } catch (e) {
      // Ignore storage errors
    }
    return [];
  }

  const RushLeaderboardAPI = {
    MAX_LEADERBOARD_ENTRIES,
    DEFAULT_PLAYER_NAME,
    formatTimeMMSS,
    sanitizePlayerName,
    getLastPlayerName,
    saveLastPlayerName,
    loadRushScores,
    saveRushScore,
    sortRushScores,
    getRushHighScore,
    getRushBestOvertime,
    clearRushScores
  };

  window.Aetherward.RushLeaderboard = RushLeaderboardAPI;

  // Also expose requested helper functions on window for easy console/external inspection
  window.loadRushScores = loadRushScores;
  window.saveRushScore = saveRushScore;
  window.sortRushScores = sortRushScores;
  window.getRushHighScore = getRushHighScore;
  window.clearRushScores = clearRushScores;
})();
