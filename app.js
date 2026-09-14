/* =====================================================
   ⚠️ এখানে আপনার Google Apps Script URL বসান
   ===================================================== */
const API_URL = "https://script.google.com/macros/s/AKfycbzonbCEglo8X1dtTXaUGWgqjAh32wKdsI_xcul1WTtUUJfCYRD15c2TzruD2oxssEVkIA/exec";

/* =====================================================
   সাধারণ সেটিংস
   ===================================================== */
const EXAM_CONFIG = {
  durationMinutes: 30,
  passMark: 20,
  adminPassword: "1234"
};

const BN_DIGITS = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
const toBn = (n) => String(n).replace(/\d/g, d => BN_DIGITS[d]);
const OPT_LABELS = ['ক','খ','গ','ঘ'];
const $ = (id) => document.getElementById(id);

/* =====================================================
   STATE
   ===================================================== */
let ALL_CHAPTERS = {};       // { "Ch-03": [ {q, options, answer}, ... ] }
let CURRENT_CHAPTER = null;
let CURRENT_QUESTIONS = [];
let student = { name:'', roll:'', cls:'' };
let answers = {};
let timeLeft = 0;
let timerHandle = null;
let examStarted = false;
let submitted = false;

/* =====================================================
   INIT
   ===================================================== */
document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  loadQuestions();
});

function bindEvents() {
  $('btnStart').addEventListener('click', startExam);
  $('btnSubmit').addEventListener('click', confirmSubmit);
  $('btnRetry').addEventListener('click', () => location.reload());
  $('btnPdf').addEventListener('click', downloadPDF);
  $('adminLink').addEventListener('click', openAdmin);
  $('btnAdminBack').addEventListener('click', () => showScreen('screen-start'));
  $('btnAdminRefresh').addEventListener('click', renderAdminTable);
  $('btnAdminExport').addEventListener('click', exportCSV);
  $('chapterSelect').addEventListener('change', updateInfoBoxes);
  $('inputName').addEventListener('input', () => $('startError').textContent = '');
}

/* =====================================================
   GOOGLE SHEET থেকে প্রশ্ন লোড
   ===================================================== */
async function loadQuestions() {
  try {
    const res = await fetch(API_URL + '?action=questions');
    const data = await res.json();

    if (data.error) throw new Error(data.error);
    if (!data.chapters || !Object.keys(data.chapters).length) {
      throw new Error('কোনো প্রশ্ন পাওয়া যায়নি');
    }

    ALL_CHAPTERS = data.chapters;
    populateChapterDropdown();

    $('loadingBox').style.display = 'none';
    $('startForm').style.display = 'block';
  } catch (err) {
    $('loadingBox').innerHTML =
      '❌ প্রশ্ন লোড করা যায়নি।<br><small>' + err.message + '</small><br><br>' +
      'API_URL ঠিক আছে কিনা চেক করুন।';
    console.error(err);
  }
}

function populateChapterDropdown() {
  const sel = $('chapterSelect');
  sel.innerHTML = '<option value="">-- অধ্যায় নির্বাচন করুন --</option>';
  Object.keys(ALL_CHAPTERS).forEach(ch => {
    const opt = document.createElement('option');
    opt.value = ch;
    opt.textContent = ch + ' (' + ALL_CHAPTERS[ch].length + 'টি প্রশ্ন)';
    sel.appendChild(opt);
  });

  // প্রথম অধ্যায় অটো সিলেক্ট
  const first = Object.keys(ALL_CHAPTERS)[0];
  if (first) {
    sel.value = first;
    updateInfoBoxes();
  }
}

function updateInfoBoxes() {
  const ch = $('chapterSelect').value;
  if (!ch || !ALL_CHAPTERS[ch]) {
    $('infoQ').textContent = '-';
    $('infoMarks').textContent = '-';
    $('infoTime').textContent = '-';
    $('infoPass').textContent = '-';
    return;
  }
  const total = ALL_CHAPTERS[ch].length;
  $('infoQ').textContent = toBn(total);
  $('infoMarks').textContent = toBn(total);
  $('infoTime').textContent = toBn(EXAM_CONFIG.durationMinutes) + ' মিনিট';
  $('infoPass').textContent = toBn(EXAM_CONFIG.passMark);
}

/* =====================================================
   SCREEN SWITCH
   ===================================================== */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* =====================================================
   START EXAM
   ===================================================== */
function startExam() {
  const name = $('inputName').value.trim();
  const ch = $('chapterSelect').value;

  if (!ch) {
    $('startError').textContent = '⚠️ অধ্যায় নির্বাচন করুন।';
    return;
  }
  if (!name) {
    $('startError').textContent = '⚠️ পরীক্ষার্থীর নাম লিখুন।';
    return;
  }

  CURRENT_CHAPTER = ch;
  CURRENT_QUESTIONS = ALL_CHAPTERS[ch];
student = {
  name: name,
  roll: '',
  cls: ''
};
  answers = {};
  submitted = false;
  examStarted = true;
  timeLeft = EXAM_CONFIG.durationMinutes * 60;

  $('hdrName').textContent = '👤 ' + student.name + (student.roll ? ' • রোল: ' + student.roll : '');
  $('hdrExam').textContent = ch + ' — ' + CURRENT_QUESTIONS.length + 'টি প্রশ্ন';

  renderQuestions();
  updateTimerDisplay();
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = setInterval(tick, 1000);

  showScreen('screen-exam');
}

/* =====================================================
   RENDER QUESTIONS
   ===================================================== */
function renderQuestions() {
  const wrap = $('questionList');
  wrap.innerHTML = '';

  CURRENT_QUESTIONS.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'q-card';
    card.id = 'qcard-' + idx;

    let optionsHTML = '';
    item.options.forEach((opt, oi) => {
      optionsHTML += `
        <label class="opt" data-q="${idx}" data-o="${oi}">
          <input type="radio" name="q${idx}" value="${oi}">
          <span class="mark">${OPT_LABELS[oi]}</span>
          <span class="opt-text">${opt}</span>
        </label>`;
    });

    card.innerHTML = `
      <div class="q-head">
        <div class="q-num">${toBn(idx + 1)}</div>
        <div class="q-text">${item.q}</div>
      </div>
      <div class="options">${optionsHTML}</div>
    `;
    wrap.appendChild(card);
  });

  wrap.querySelectorAll('.opt').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      if (submitted) return;
      selectAnswer(parseInt(el.dataset.q), parseInt(el.dataset.o));
    });
  });

  updateAnsweredCount();
}

function selectAnswer(qi, oi) {
  answers[qi] = oi;
  const card = $('qcard-' + qi);
  card.querySelectorAll('.opt').forEach((el) => {
    el.classList.toggle('selected', parseInt(el.dataset.o) === oi);
  });
  card.classList.add('answered');
  updateAnsweredCount();
}

function updateAnsweredCount() {
  const done = Object.keys(answers).length;
  const total = CURRENT_QUESTIONS.length;
  $('answeredCount').textContent =
    `উত্তর দেওয়া হয়েছে: ${toBn(done)} / ${toBn(total)}`;
  $('progressBar').style.width = (done / total * 100) + '%';
}

/* =====================================================
   TIMER
   ===================================================== */
function tick() {
  if (!examStarted || submitted) return;
  timeLeft--;
  updateTimerDisplay();
  if (timeLeft <= 0) {
    clearInterval(timerHandle);
    alert('⏰ সময় শেষ! পরীক্ষা স্বয়ংক্রিয়ভাবে জমা হচ্ছে...');
    doSubmit();
  }
}

function updateTimerDisplay() {
  const m = Math.floor(timeLeft / 60);
  const s = timeLeft % 60;
  $('timer').textContent = '⏱ ' + toBn(String(m).padStart(2,'0')) + ':' + toBn(String(s).padStart(2,'0'));
  $('timer').classList.toggle('warn', timeLeft <= 60);
}

/* =====================================================
   SUBMIT
   ===================================================== */
function confirmSubmit() {
  const done = Object.keys(answers).length;
  const total = CURRENT_QUESTIONS.length;
  const msg = done < total
    ? `আপনি ${toBn(total - done)} টি প্রশ্নের উত্তর দেননি। তবুও জমা দিতে চান?`
    : 'আপনি কি নিশ্চিত পরীক্ষা জমা দিতে চান?';
  if (confirm(msg)) doSubmit();
}

function doSubmit() {
  if (submitted) return;
  submitted = true;
  if (timerHandle) clearInterval(timerHandle);

  const result = calculateResult();
  renderResult(result);
  saveResult(result);
  showScreen('screen-result');
}

/* =====================================================
   RESULT
   ===================================================== */
function calculateResult() {
  let correct = 0, wrong = 0, skipped = 0;
  const details = CURRENT_QUESTIONS.map((item, i) => {
    const chosen = answers.hasOwnProperty(i) ? answers[i] : null;
    let status;
    if (chosen === null) { skipped++; status = 'skipped'; }
    else if (chosen === item.answer) { correct++; status = 'correct'; }
    else { wrong++; status = 'wrong'; }
    return {
      index: i,
      question: item.q,
      options: item.options,
      correctAnswer: item.answer,
      chosenAnswer: chosen,
      status
    };
  });

  const total = CURRENT_QUESTIONS.length;
  const mark = correct;
  const percentage = Math.round((mark / total) * 100);
  const passed = mark >= EXAM_CONFIG.passMark;

  return {
    student: { ...student },
    chapter: CURRENT_CHAPTER,
    total, mark, correct, wrong, skipped,
    percentage, passed,
    date: new Date().toLocaleString('bn-BD'),
    details
  };
}

function renderResult(r) {
  $('scoreText').textContent = toBn(r.mark);
  $('scoreCircle').classList.toggle('fail', !r.passed);
  $('resultTitle').textContent = r.passed ? '🎉 অভিনন্দন! আপনি পাস করেছেন' : '😔 দুঃখিত! আপনি পাস করতে পারেননি';
  $('resultSub').textContent = `${r.student.name} — ${r.chapter}`;

  $('resultStats').innerHTML = `
    <div class="stat"><span>মোট প্রশ্ন</span><strong>${toBn(r.total)}</strong></div>
    <div class="stat ok"><span>সঠিক</span><strong>${toBn(r.correct)}</strong></div>
    <div class="stat bad"><span>ভুল</span><strong>${toBn(r.wrong)}</strong></div>
    <div class="stat mid"><span>বাদ পড়েছে</span><strong>${toBn(r.skipped)}</strong></div>
  `;

  const wrap = $('reviewWrap');
  wrap.innerHTML = '<h2 class="review-title">📋 উত্তরপত্র পর্যালোচনা</h2>';

  r.details.forEach((d, i) => {
    const cls = d.status;
    const badge = d.status === 'correct' ? '✔ সঠিক' :
                  d.status === 'wrong' ? '✘ ভুল' : '⚠ উত্তর দেননি';

    let optsHTML = '';
    d.options.forEach((opt, oi) => {
      let ocls = '';
      if (oi === d.correctAnswer) ocls = 'correct-ans';
      else if (oi === d.chosenAnswer && d.status === 'wrong') ocls = 'wrong-ans';
      optsHTML += `<div class="rev-opt ${ocls}">
        <span class="rk">${OPT_LABELS[oi]}</span>
        <span>${opt}</span>
      </div>`;
    });

    const note = (d.status !== 'correct')
      ? `<div class="rev-note">✔ সঠিক উত্তর: <b>${OPT_LABELS[d.correctAnswer]}) ${d.options[d.correctAnswer]}</b></div>`
      : '';

    wrap.innerHTML += `
      <div class="rev-card ${cls}">
        <div class="rev-head">
          <div class="rev-q">${toBn(i + 1)}। ${d.question}</div>
          <span class="rev-badge ${cls}">${badge}</span>
        </div>
        ${optsHTML}
        ${note}
      </div>`;
  });
}

/* =====================================================
   SAVE (Google Sheet এ পাঠায়)
   ===================================================== */
async function saveResult(r) {
  try {
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: r.date,
        name: r.student.name,
        roll: r.student.roll,
        cls: r.student.cls,
        chapter: r.chapter,
        mark: r.mark,
        total: r.total,
        correct: r.correct,
        wrong: r.wrong,
        skipped: r.skipped,
        percentage: r.percentage,
        passed: r.passed
      })
    });
    console.log('✅ Result sent to Google Sheet');
  } catch (e) {
    console.warn('Save failed:', e);
  }
}

/* =====================================================
   ADMIN
   ===================================================== */
function openAdmin() {
  const pwd = prompt('🔒 অ্যাডমিন পাসওয়ার্ড লিখুন:');
  if (pwd === null) return;
  if (pwd !== EXAM_CONFIG.adminPassword) {
    alert('❌ ভুল পাসওয়ার্ড!');
    return;
  }
  renderAdminTable();
  showScreen('screen-admin');
}

async function renderAdminTable() {
  const body = $('adminBody');
  body.innerHTML = '<p class="empty-msg">⏳ ডেটা লোড হচ্ছে...</p>';

  let all = [];
  try {
    const res = await fetch(API_URL + '?action=results');
    all = await res.json();
  } catch (e) {
    body.innerHTML = '<p class="empty-msg">❌ ডেটা লোড করা যায়নি।</p>';
    return;
  }

  if (!Array.isArray(all) || !all.length) {
    body.innerHTML = '<p class="empty-msg">📭 এখনো কোনো ফলাফল নেই।</p>';
    return;
  }

  let html = `<table class="res-table">
    <thead><tr>
      <th>#</th><th>নাম</th><th>রোল</th><th>শ্রেণি</th><th>অধ্যায়</th>
      <th>প্রাপ্ত</th><th>মোট</th><th>সঠিক</th><th>ভুল</th>
      <th>শতকরা</th><th>ফলাফল</th><th>তারিখ</th>
    </tr></thead><tbody>`;

  all.slice().reverse().forEach((r, i) => {
    const passed = r['ফলাফল'] === 'পাস';
    const tag = passed ? '<span class="tag-pass">পাস</span>' : '<span class="tag-fail">ফেল</span>';
    html += `<tr>
      <td>${toBn(all.length - i)}</td>
      <td><b>${esc(r['নাম'])}</b></td>
      <td>${esc(r['রোল'] || '-')}</td>
      <td>${esc(r['শ্রেণি'] || '-')}</td>
      <td>${esc(r['অধ্যায়'] || '-')}</td>
      <td><b>${toBn(r['প্রাপ্ত'])}</b></td>
      <td>${toBn(r['মোট'])}</td>
      <td style="color:#2e7d32">${toBn(r['সঠিক'])}</td>
      <td style="color:#e53935">${toBn(r['ভুল'])}</td>
      <td>${r['শতকরা']}</td>
      <td>${tag}</td>
      <td>${esc(r['তারিখ'])}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  body.innerHTML = html;
}

async function exportCSV() {
  const res = await fetch(API_URL + '?action=results');
  const all = await res.json();
  if (!all.length) { alert('কোনো ডেটা নেই।'); return; }

  const headers = ['তারিখ','নাম','রোল','শ্রেণি','অধ্যায়','প্রাপ্ত','মোট','সঠিক','ভুল','বাদ','শতকরা','ফলাফল'];
  const rows = all.map(r => headers.map(h => r[h] || ''));

  const csv = '\uFEFF' + [headers, ...rows]
    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'exam_results_' + Date.now() + '.csv';
  a.click();
}

/* =====================================================
   PDF
   ===================================================== */
async function downloadPDF() {
  const btn = $('btnPdf');
  const oldTxt = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ তৈরি হচ্ছে...';

  try {
    const r = calculateResult();
    const pdf = $('pdfContent');
    pdf.innerHTML = buildPDFHTML(r);
    await document.fonts.ready;
    await new Promise(res => setTimeout(res, 400));

    const canvas = await html2canvas(pdf, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 800
    });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    let heightLeft = imgH, position = 0;
    doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, position, imgW, imgH);
    heightLeft -= pageH;

    while (heightLeft > 0) {
      position = heightLeft - imgH;
      doc.addPage();
      doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, position, imgW, imgH);
      heightLeft -= pageH;
    }

    const safeName = (r.student.name || 'student').replace(/[^\w\u0980-\u09FF]+/g, '_');
    doc.save(`Result_${safeName}.pdf`);
  } catch (e) {
    console.error(e);
    alert('PDF তৈরিতে সমস্যা: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = oldTxt;
  }
}

function buildPDFHTML(r) {
  const statusBadge = (s) =>
    s === 'correct' ? '✔ সঠিক' : s === 'wrong' ? '✘ ভুল' : '⚠ উত্তর দেননি';

  let qHTML = '';
  r.details.forEach((d, i) => {
    let opts = '';
    d.options.forEach((opt, oi) => {
      let cls = '';
      if (oi === d.correctAnswer) cls = 'correct';
      else if (oi === d.chosenAnswer && d.status === 'wrong') cls = 'wrong';
      opts += `<div class="pdf-opt ${cls}">${OPT_LABELS[oi]}) ${esc(opt)}</div>`;
    });

    const ansLine = (d.status !== 'correct')
      ? `<div style="margin-top:6px;font-size:12px;color:#b71c1c;">
           ✔ সঠিক উত্তর: <b>${OPT_LABELS[d.correctAnswer]}) ${esc(d.options[d.correctAnswer])}</b>
         </div>` : '';

    qHTML += `
      <div class="pdf-q ${d.status}">
        <div class="pdf-q-head">${toBn(i + 1)}। ${esc(d.question)} <span style="float:right;font-size:11px;color:#555;">[${statusBadge(d.status)}]</span></div>
        ${opts}
        ${ansLine}
      </div>`;
  });

  return `
    <div class="pdf-inner">
      <h1>${esc(r.chapter)} — অনলাইন পরীক্ষা</h1>
      <div class="pdf-sub">ফলাফল ও উত্তরপত্র</div>
      <div class="pdf-student">
        <div><b>পরীক্ষার্থী:</b> ${esc(r.student.name)}</div>
        <div><b>রোল:</b> ${esc(r.student.roll || '—')}</div>
        <div><b>শ্রেণি:</b> ${esc(r.student.cls || '—')}</div>
        <div><b>তারিখ:</b> ${esc(r.date)}</div>
      </div>
      <div class="pdf-result-box">
        <div>প্রাপ্ত নম্বর</div>
        <div class="big">${toBn(r.mark)} / ${toBn(r.total)}</div>
        <div style="margin-top:6px;">
          সঠিক: ${toBn(r.correct)} | ভুল: ${toBn(r.wrong)} | বাদ: ${toBn(r.skipped)} |
          শতকরা: ${toBn(r.percentage)}% |
          ফলাফল: <b style="color:${r.passed ? '#2e7d32' : '#e53935'}">${r.passed ? 'পাস' : 'ফেল'}</b>
        </div>
      </div>
      <h2 style="font-size:16px;color:#1b5e20;border-left:5px solid #1b5e20;padding-left:8px;margin:16px 0 10px;">
        📋 উত্তরপত্র পর্যালোচনা
      </h2>
      ${qHTML}
      <div class="pdf-foot">— স্বয়ংক্রিয়ভাবে তৈরি —</div>
    </div>
  `;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.addEventListener('beforeunload', (e) => {
  if (examStarted && !submitted) { e.preventDefault(); e.returnValue = ''; }
});
