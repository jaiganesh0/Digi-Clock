(() => {
  "use strict";

  // =========================================
  // DOM Elements
  // =========================================
  const clockCard = document.querySelector(".clock-card");
  const statusDot = document.getElementById("status-dot");
  const statusBadge = document.getElementById("status-badge");

  const dayDisplay = document.getElementById("day-display");
  const dateDisplay = document.getElementById("date-display");
  const hoursEl = document.getElementById("hours");
  const minutesEl = document.getElementById("minutes");
  const secondsEl = document.getElementById("seconds");
  const ampmDisplay = document.getElementById("ampm-display");

  const btn12h = document.getElementById("btn-12h");
  const btn24h = document.getElementById("btn-24h");
  const btnStartStop = document.getElementById("btn-start-stop");

  const alarmInput = document.getElementById("alarm-input");
  const btnSetAlarm = document.getElementById("btn-set-alarm");
  const btnClearAlarm = document.getElementById("btn-clear-alarm");
  const alarmStatus = document.getElementById("alarm-status");
  const alarmAlert = document.getElementById("alarm-alert");
  const alarmAlertText = document.getElementById("alarm-alert-text");
  const btnStopAlarm = document.getElementById("btn-stop-alarm");

  // =========================================
  // Application State
  // =========================================
  let is24Hour = false;
  let isRunning = true;
  let clockIntervalId = null;
  let lastRenderedDate = new Date();

  let alarmTime24 = null; // Stored as "HH:MM" in 24-hour format
  let lastTriggeredKey = null; // Prevents duplicate triggers within the same minute
  let alarmBeepIntervalId = null;
  let audioCtx = null;

  // =========================================
  // Utility Helpers
  // =========================================
  const padZero = (num) => String(num).padStart(2, "0");

  function formatDisplayTimeFrom24(hhmm) {
    const [hStr, mStr] = hhmm.split(":");
    const hours24 = Number(hStr);
    if (is24Hour) {
      return `${padZero(hours24)}:${mStr}`;
    }
    const period = hours24 >= 12 ? "PM" : "AM";
    const hours12 = hours24 % 12 || 12;
    return `${padZero(hours12)}:${mStr} ${period}`;
  }

  function loadPreferences() {
    try {
      const savedFormat = localStorage.getItem("clock_is24Hour");
      if (savedFormat !== null) {
        is24Hour = savedFormat === "true";
      }
      const savedAlarm = localStorage.getItem("clock_alarmTime24");
      if (savedAlarm && /^\d{2}:\d{2}$/.test(savedAlarm)) {
        alarmTime24 = savedAlarm;
        alarmInput.value = savedAlarm;
      }
    } catch {
      // Ignore storage errors if running in restricted browser contexts
    }
  }

  function saveFormatPreference() {
    try {
      localStorage.setItem("clock_is24Hour", String(is24Hour));
    } catch {
      // Ignore storage errors
    }
  }

  function saveAlarmPreference(value) {
    try {
      if (value) {
        localStorage.setItem("clock_alarmTime24", value);
      } else {
        localStorage.removeItem("clock_alarmTime24");
      }
    } catch {
      // Ignore storage errors
    }
  }

  // =========================================
  // Clock Rendering
  // =========================================
  function renderDateTime(dateObj) {
    lastRenderedDate = dateObj;

    const hours24 = dateObj.getHours();
    const minutes = dateObj.getMinutes();
    const seconds = dateObj.getSeconds();

    let displayHours = hours24;
    if (is24Hour) {
      ampmDisplay.classList.add("hidden");
    } else {
      const period = hours24 >= 12 ? "PM" : "AM";
      displayHours = hours24 % 12 || 12;
      ampmDisplay.textContent = period;
      ampmDisplay.classList.remove("hidden");
    }

    hoursEl.textContent = padZero(displayHours);
    minutesEl.textContent = padZero(minutes);
    secondsEl.textContent = padZero(seconds);

    dayDisplay.textContent = dateObj.toLocaleDateString(undefined, {
      weekday: "long",
    });

    dateDisplay.textContent = dateObj.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function tick() {
    const now = new Date();
    renderDateTime(now);
    checkAlarm(now);
  }

  function startClock() {
    if (clockIntervalId !== null) return;
    isRunning = true;
    tick();
    clockIntervalId = setInterval(tick, 250);
    updateRunningUI();
  }

  function stopClock() {
    if (clockIntervalId !== null) {
      clearInterval(clockIntervalId);
      clockIntervalId = null;
    }
    isRunning = false;
    updateRunningUI();
  }

  function updateRunningUI() {
    if (isRunning) {
      statusDot.classList.remove("paused");
      statusBadge.classList.remove("paused");
      statusBadge.textContent = "LIVE";
      btnStartStop.textContent = "Pause Clock";
    } else {
      statusDot.classList.add("paused");
      statusBadge.classList.add("paused");
      statusBadge.textContent = "PAUSED";
      btnStartStop.textContent = "Start Clock";
    }
  }

  function updateFormatUI() {
    btn12h.classList.toggle("active", !is24Hour);
    btn12h.setAttribute("aria-pressed", String(!is24Hour));

    btn24h.classList.toggle("active", is24Hour);
    btn24h.setAttribute("aria-pressed", String(is24Hour));

    renderDateTime(lastRenderedDate);
    refreshAlarmStatusText();
  }

  // =========================================
  // Alarm & Web Audio Tone
  // =========================================
  function ensureAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playBeep() {
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);

    gainNode.gain.setValueAtTime(0.001, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.03);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.36);
  }

  function triggerAlarm(displayTime) {
    clockCard.classList.add("ringing");
    alarmAlertText.textContent = `Alarm ringing! (${displayTime})`;
    alarmAlert.classList.remove("hidden");

    playBeep();
    if (alarmBeepIntervalId === null) {
      alarmBeepIntervalId = setInterval(playBeep, 900);
    }
  }

  function stopAlarmSound() {
    clockCard.classList.remove("ringing");
    alarmAlert.classList.add("hidden");

    if (alarmBeepIntervalId !== null) {
      clearInterval(alarmBeepIntervalId);
      alarmBeepIntervalId = null;
    }
  }

  function checkAlarm(now) {
    if (!alarmTime24) return;

    const currentHHMM = `${padZero(now.getHours())}:${padZero(now.getMinutes())}`;
    const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()} ${currentHHMM}`;

    if (currentHHMM === alarmTime24 && lastTriggeredKey !== minuteKey) {
      lastTriggeredKey = minuteKey;
      triggerAlarm(formatDisplayTimeFrom24(alarmTime24));
    }
  }

  function refreshAlarmStatusText() {
    alarmStatus.classList.remove("error", "active");
    if (alarmTime24) {
      alarmStatus.textContent = `Active for ${formatDisplayTimeFrom24(alarmTime24)}`;
      alarmStatus.classList.add("active");
      btnClearAlarm.classList.remove("hidden");
    } else {
      alarmStatus.textContent = "No alarm set";
      btnClearAlarm.classList.add("hidden");
    }
  }

  // =========================================
  // Event Listeners
  // =========================================
  btn12h.addEventListener("click", () => {
    if (!is24Hour) return;
    is24Hour = false;
    saveFormatPreference();
    updateFormatUI();
  });

  btn24h.addEventListener("click", () => {
    if (is24Hour) return;
    is24Hour = true;
    saveFormatPreference();
    updateFormatUI();
  });

  btnStartStop.addEventListener("click", () => {
    if (isRunning) {
      stopClock();
    } else {
      startClock();
    }
  });

  btnSetAlarm.addEventListener("click", () => {
    ensureAudioContext(); // Unlock browser audio on user interaction
    const selectedTime = alarmInput.value;

    if (!selectedTime) {
      alarmStatus.textContent = "Please choose a valid time first.";
      alarmStatus.classList.remove("active");
      alarmStatus.classList.add("error");
      return;
    }

    alarmTime24 = selectedTime;
    lastTriggeredKey = null;
    saveAlarmPreference(alarmTime24);
    stopAlarmSound();
    refreshAlarmStatusText();
  });

  btnClearAlarm.addEventListener("click", () => {
    alarmTime24 = null;
    lastTriggeredKey = null;
    alarmInput.value = "";
    saveAlarmPreference(null);
    stopAlarmSound();
    refreshAlarmStatusText();
  });

  btnStopAlarm.addEventListener("click", () => {
    stopAlarmSound();
  });

  // =========================================
  // Initialize Application
  // =========================================
  loadPreferences();
  updateFormatUI();
  startClock();
})();