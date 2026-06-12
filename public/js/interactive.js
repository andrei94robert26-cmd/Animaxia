/* ============================================
   Animaxia Interactive Module v1.0
   Quiz-uri educaționale SciShowTyme style,
   Module de învățare, Progres cursuri
   ============================================ */

(function() {
  'use strict';

  if (typeof App === 'undefined') { setTimeout(arguments.callee, 500); return; }

  const IM = {
    // ====== QUIZZES ======
    quizzes: [
      {
        id: 'quiz-stiinta-1',
        title: { ro: 'Știința în Acțiune', en: 'Science in Action' },
        icon: '🔬',
        questions: [
          { q: { ro: 'Care este cea mai apropiată stea de Pământ?', en: 'What is the closest star to Earth?' }, options: ['Soarele/The Sun', 'Alpha Centauri', 'Sirius', 'Proxima Centauri'], correct: 0 },
          { q: { ro: 'Câte planete are sistemul solar?', en: 'How many planets are in our solar system?' }, options: ['7', '8', '9', '10'], correct: 1 },
          { q: { ro: 'Ce element chimic este reprezentat de simbolul "O"?', en: 'Which chemical element is represented by "O"?' }, options: ['Aur/Gold', 'Oxigen/Oxygen', 'Osmium', 'Oganesson'], correct: 1 },
          { q: { ro: 'Care este cel mai mare ocean de pe Pământ?', en: 'What is the largest ocean on Earth?' }, options: ['Atlantic', 'Indian', ' Arctic', 'Pacific'], correct: 3 },
          { q: { ro: 'Cât timp durează lumina să ajungă de la Soare la Pământ?', en: 'How long does light take to travel from the Sun to Earth?' }, options: ['3 minute', '8 minute', '15 minute', '1 oră/hour'], correct: 1 },
        ],
        image: 'linear-gradient(135deg, #00b894, #0984e3)'
      },
      {
        id: 'quiz-natura-1',
        title: { ro: 'Minunile Naturii', en: 'Wonders of Nature' },
        icon: '🌿',
        questions: [
          { q: { ro: 'Care este cel mai mare animal de pe uscat?', en: 'What is the largest land animal?' }, options: ['Elefantul african/African elephant', 'Rinocerul/Rhinoceros', 'Hipopotamul/Hippo', 'Girafa/Giraffe'], correct: 0 },
          { q: { ro: 'Câte specii de insecte se estimează că există?', en: 'How many insect species are estimated to exist?' }, options: ['1 milion', '5 milioane/million', '10 milioane/million', '30 milioane/million'], correct: 2 },
          { q: { ro: 'Care este cel mai înalt munte din lume?', en: 'What is the tallest mountain in the world?' }, options: ['K2', 'Everest', 'Denali', 'Kilimanjaro'], correct: 1 },
          { q: { ro: 'Ce este coralii?', en: 'What are corals?' }, options: ['Plante/Plants', 'Minerale/Minerals', 'Animale/Animals', 'Roci/Rocks'], correct: 2 },
          { q: { ro: 'Care este cel mai iute animal marin?', en: 'What is the fastest marine animal?' }, options: ['Rechinul/Shark', 'Delfinul/Dolphin', 'Peștele-spadă/Swordfish', 'Calul-de-mare/Seahorse'], correct: 2 },
        ],
        image: 'linear-gradient(135deg, #00cec9, #55efc4)'
      },
      {
        id: 'quiz-space-1',
        title: { ro: 'Exploratorii Spațiului', en: 'Space Explorers' },
        icon: '🚀',
        questions: [
          { q: { ro: 'Cine a fost primul om pe Lună?', en: 'Who was the first person on the Moon?' }, options: ['Buzz Aldrin', 'Neil Armstrong', 'Yuri Gagarin', 'John Glenn'], correct: 1 },
          { q: { ro: 'Care este cea mai mare planetă din sistemul solar?', en: 'What is the largest planet in our solar system?' }, options: ['Saturn', 'Neptun/Neptune', 'Jupiter', 'Uranus'], correct: 2 },
          { q: { ro: 'Cât durează o rotație completă a Pământului?', en: 'How long does one Earth rotation take?' }, options: ['12 ore/hours', '24 ore/hours', '48 ore/hours', '365 zile/days'], correct: 1 },
          { q: { ro: 'Ce este o galaxie?', en: 'What is a galaxy?' }, options: ['O stea/A star', 'Un sistem solar/A solar system', 'Un grup de stele/A group of stars', 'O planetă/A planet'], correct: 2 },
          { q: { ro: 'Care planetă este cunoscută ca "Planeta Roșie"?', en: 'Which planet is known as the "Red Planet"?' }, options: ['Venus', 'Marte/Mars', 'Mercur/Mercury', 'Jupiter'], correct: 1 },
        ],
        image: 'linear-gradient(135deg, #6c5ce7, #a29bfe)'
      },
    ],

    quizStates: {},

    init() {
      this.addQuizSection();
      this.addQuizButtons();
    },

    // ====== QUIZ SECTION ======
    addQuizSection() {
      const container = document.getElementById('contentRows');
      if (!container) return;

      const sec = document.createElement('section');
      sec.className = 'content-section quiz-section';
      sec.id = 'quizSection';
      sec.innerHTML = `
        <div class="section-header">
          <h2 class="section-title">🧠 <span data-lang="ro">Quiz-uri Interactive</span><span data-lang="en" style="display:none;">Interactive Quizzes</span></h2>
          <span class="section-link" style="font-size:12px;color:var(--text-tertiary);">
            <span data-lang="ro">Testează-ți cunoștințele!</span>
            <span data-lang="en" style="display:none;">Test your knowledge!</span>
          </span>
        </div>
        <div class="quiz-grid" id="quizGrid"></div>`;
      container.appendChild(sec);

      this.renderQuizGrid();
    },

    renderQuizGrid() {
      const grid = document.getElementById('quizGrid');
      if (!grid) return;

      const lang = window.appLang || 'ro';
      grid.innerHTML = this.quizzes.map(q => {
        const state = this.quizStates[q.id] || {};
        const completed = state.completed || false;
        const score = state.score || 0;
        const total = q.questions.length;

        return `
          <div class="quiz-card" data-quiz="${q.id}">
            <div class="quiz-card-bg" style="background:${q.image}">
              <span class="quiz-card-icon">${q.icon}</span>
              <span class="quiz-card-title">${q.title[lang]}</span>
            </div>
            <div class="quiz-card-body">
              ${completed ? `
                <div class="quiz-result">
                  <span class="quiz-score ${score >= 4 ? 'good' : score >= 3 ? 'ok' : 'bad'}">${score}/${total}</span>
                  <span class="quiz-status-label">
                    ${score >= 4 ? (lang === 'en' ? '🌟 Excellent!' : '🌟 Excelent!') : 
                      score >= 3 ? (lang === 'en' ? '👍 Good!' : '👍 Bine!') : 
                      (lang === 'en' ? '🔄 Try again' : '🔄 Încearcă din nou')}
                  </span>
                </div>
              ` : `
                <span class="quiz-status-label new">${lang === 'en' ? '🎯 New!' : '🎯 Nou!'}</span>
              `}
              <button class="btn btn-primary quiz-start-btn" data-quiz="${q.id}" style="width:100%;justify-content:center;padding:8px;">
                ${completed ? (lang === 'en' ? '🔄 Retry' : '🔄 Reîncepe') : (lang === 'en' ? '▶ Start Quiz' : '▶ Începe Quiz')}
              </button>
            </div>
          </div>`;
      }).join('');

      grid.querySelectorAll('.quiz-start-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.startQuiz(btn.dataset.quiz);
        });
      });
    },

    // ====== QUIZ PLAYER ======
    startQuiz(quizId) {
      const quiz = this.quizzes.find(q => q.id === quizId);
      if (!quiz) { App.toast('Quiz not found', 'error'); return; }

      this.quizStates[quizId] = { current: 0, answers: [], score: 0, completed: false };
      this.showQuizModal(quiz);
    },

    showQuizModal(quiz) {
      const existing = document.getElementById('quizModal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'quizModal';
      modal.className = 'admin-modal-overlay';
      modal.style.zIndex = '10001';

      const state = this.quizStates[quiz.id];
      const q = quiz.questions[state.current || 0];
      const lang = window.appLang || 'ro';
      const total = quiz.questions.length;

      modal.innerHTML = `
        <div class="admin-modal quiz-modal-content" style="max-width:500px;">
          <div class="quiz-modal-header">
            <span class="quiz-modal-icon">${quiz.icon}</span>
            <h3>${quiz.title[lang]}</h3>
            <button class="quiz-modal-close" onclick="document.getElementById('quizModal').remove()">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="quiz-progress-bar">
            <div class="quiz-progress-fill" style="width:${((state.current || 0) / total) * 100}%"></div>
          </div>
          <div class="quiz-progress-text">${(state.current || 0) + 1} / ${total}</div>
          <div class="quiz-question">
            <p>${q.q[lang]}</p>
          </div>
          <div class="quiz-options" id="quizOptions">
            ${q.options.map((opt, i) => `
              <button class="quiz-option" data-index="${i}">
                <span class="quiz-option-letter">${String.fromCharCode(65 + i)}</span>
                <span class="quiz-option-text">${opt}</span>
              </button>
            `).join('')}
          </div>
          <div class="quiz-feedback" id="quizFeedback" style="display:none;"></div>
        </div>`;

      document.body.appendChild(modal);

      modal.querySelectorAll('.quiz-option').forEach(btn => {
        btn.addEventListener('click', () => this.answerQuiz(quiz.id, parseInt(btn.dataset.index)));
      });
    },

    answerQuiz(quizId, answerIndex) {
      const quiz = this.quizzes.find(q => q.id === quizId);
      if (!quiz) return;

      const state = this.quizStates[quizId];
      const q = quiz.questions[state.current];
      const correct = answerIndex === q.correct;
      const lang = window.appLang || 'ro';

      if (correct) state.score = (state.score || 0) + 1;
      state.answers.push(answerIndex);

      const feedback = document.getElementById('quizFeedback');
      const options = document.querySelectorAll('.quiz-option');
      if (feedback && options) {
        options.forEach((opt, i) => {
          opt.disabled = true;
          if (i === q.correct) opt.classList.add('correct');
          else if (i === answerIndex && !correct) opt.classList.add('wrong');
        });

        feedback.style.display = 'block';
        feedback.innerHTML = `
          <div class="quiz-feedback-icon">${correct ? '✅' : '❌'}</div>
          <div class="quiz-feedback-text">
            ${correct ? (lang === 'en' ? 'Correct! 🎉' : 'Corect! 🎉') : (lang === 'en' ? 'Not quite! The correct answer was:' : 'Nu chiar! Răspunsul corect era:')}
            ${!correct ? `<strong>${q.options[q.correct]}</strong>` : ''}
          </div>
          <button class="btn btn-primary quiz-next-btn" style="margin-top:12px;width:100%;justify-content:center;padding:8px;">
            ${state.current + 1 >= quiz.questions.length ? 
              (lang === 'en' ? '🎉 See Results' : '🎉 Vezi Rezultatul') : 
              (lang === 'en' ? '➡ Next Question' : '➡ Următoarea Întrebare')}
          </button>`;

        feedback.querySelector('.quiz-next-btn').addEventListener('click', () => {
          state.current = (state.current || 0) + 1;
          if (state.current >= quiz.questions.length) {
            state.completed = true;
            document.getElementById('quizModal')?.remove();
            this.showQuizResult(quiz);
            this.renderQuizGrid();
          } else {
            this.showQuizModal(quiz);
          }
        });
      }
    },

    showQuizResult(quiz) {
      const state = this.quizStates[quiz.id];
      const lang = window.appLang || 'ro';
      const score = state.score || 0;
      const total = quiz.questions.length;

      const grade = score === total ? '🌟🌟🌟' : score >= total * 0.8 ? '🌟🌟' : score >= total * 0.6 ? '🌟' : '💪';
      const msg = score === total ? (lang === 'en' ? 'Perfect score! Genius!' : 'Scor perfect! Geniu!') :
                  score >= total * 0.8 ? (lang === 'en' ? 'Great job! Almost perfect!' : 'Excelent! Aproape perfect!') :
                  score >= total * 0.6 ? (lang === 'en' ? 'Good effort! Keep learning!' : 'Bun efort! Continuă să înveți!') :
                  (lang === 'en' ? 'Keep practicing! You\'ll get better!' : 'Continuă să exersezi! Vei fi mai bun!');

      const modal = document.createElement('div');
      modal.id = 'quizResultModal';
      modal.className = 'admin-modal-overlay';
      modal.style.zIndex = '10001';
      modal.innerHTML = `
        <div class="admin-modal quiz-modal-content" style="max-width:400px;text-align:center;">
          <div style="font-size:48px;margin-bottom:16px;">${grade}</div>
          <h3 style="margin-bottom:8px;">${lang === 'en' ? 'Quiz Complete!' : 'Quiz Finalizat!'}</h3>
          <div style="font-size:48px;font-weight:900;color:var(--accent-secondary);margin:16px 0;">
            ${score}<span style="font-size:24px;color:var(--text-tertiary);">/${total}</span>
          </div>
          <p style="color:var(--text-secondary);margin-bottom:16px;">${msg}</p>
          <div class="quiz-result-bar">
            <div class="quiz-result-fill ${score >= 4 ? 'good' : score >= 3 ? 'ok' : 'bad'}" style="width:${(score/total)*100}%"></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:20px;justify-content:center;">
            <button class="btn btn-primary" onclick="document.getElementById('quizResultModal').remove(); window.InteractiveModule?.startQuiz('${quiz.id}')">
              🔄 ${lang === 'en' ? 'Try Again' : 'Încearcă Din Nou'}
            </button>
            <button class="btn btn-secondary" onclick="document.getElementById('quizResultModal').remove()">
              ${lang === 'en' ? 'Close' : 'Închide'}
            </button>
          </div>
        </div>`;
      document.body.appendChild(modal);

      // Save progress to localStorage
      try {
        const progress = JSON.parse(localStorage.getItem('animaxia_quiz_progress') || '{}');
        progress[quiz.id] = { score, total, completed: true, date: new Date().toISOString() };
        localStorage.setItem('animaxia_quiz_progress', JSON.stringify(progress));
      } catch {}
    },

    // ====== QUIZ BUTTONS IN DETAIL ======
    addQuizButtons() {
      // Add educational badge to content cards that match quiz topics
      const observer = new MutationObserver(() => {
        document.querySelectorAll('.content-card').forEach(card => {
          if (card.querySelector('.edu-badge')) return;
          const id = card.dataset.id;
          const item = (window.AnimaxiaData?.findItem?.(id)) || window.App?.findItem(id);
          if (item && item.genre && item.genre.some(g => ['Educational','Stiinta','Documentar'].includes(g))) {
            const badge = document.createElement('span');
            badge.className = 'edu-badge';
            badge.textContent = '🧠';
            badge.title = window.appLang === 'en' ? 'Educational content' : 'Conținut educațional';
            card.querySelector('.card-badge')?.after(badge);
          }
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    },
  };

  // Init after App
  function waitForApp() {
    if (window.App && document.getElementById('contentRows')?.children.length > 0) {
      setTimeout(() => IM.init(), 2000);
    } else {
      setTimeout(waitForApp, 500);
    }
  }
  waitForApp();

  window.InteractiveModule = IM;
})();
