/* ES5 only. Intentionally independent of React, modules, fetch and WebSocket. */
(function () {
  'use strict';
  var config = window.QUIZ_TV_CONFIG || {};
  var pack = null;
  var snapshot = null;
  var pending = false;
  var revision = -1;
  var questionView = null;
  var wakeLock = null;
  var wakePending = false;
  var buzzer = null;
  var responseRequest = false;
  var lobbyRoster = [];
  var rosterRequest = false;
  var timerView = null;
  var timerAudio = null;
  var timerSound = false;
  var previousCue = '';
  var formatLabels={estimate:'Кто ближе?',turns:'Варианты по очереди',choice:'Варианты для всех',
    order:'Расставь по порядку',wager:'Ставки',written:'Письменный ответ'};
  var formatIcons={estimate:'≈',turns:'↻',choice:'☑',order:'⇅'};
  var ranks = ['', 'tv-gold', 'tv-silver', 'tv-bronze'];
  var content = document.getElementById('tv-content');
  var players = document.getElementById('tv-players');
  var errorBox = document.getElementById('tv-error');
  var status = document.getElementById('tv-status');


  function text(node, value) {
    while (node.firstChild) node.removeChild(node.firstChild);
    node.appendChild(document.createTextNode(String(value == null ? '' : value)));
  }
  function el(tag, className, value, parent) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) text(node, value);
    if (parent) parent.appendChild(node);
    return node;
  }
  function showError(message) {
    text(errorBox, message);
    errorBox.style.display = message ? 'block' : 'none';
  }
  function request(url, authenticated, callback) {
    var xhr;
    var finished = false;
    var timer;
    function done(error, data) {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      callback(error, data);
    }
    try {
      xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      if (authenticated) xhr.setRequestHeader('apikey', config.key);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status < 200 || xhr.status >= 300) {
          done('Не удалось подключиться к игре (HTTP ' + xhr.status + '). Проверьте интернет на телевизоре.');
          return;
        }
        try { var data = JSON.parse(xhr.responseText); }
        catch (e) { done('Сервер вернул некорректные данные. Попробуйте обновить страницу.'); return; }
        done(null, data);
      };
      xhr.onerror = function () { done('Нет связи с игрой. Проверьте интернет; старый телевизор также может не поддерживать защищённое соединение сайта.'); };
      timer = window.setTimeout(function () {
        done('Сервер не ответил. Повторяем подключение…');
        xhr.abort();
      }, 12000);
      xhr.send(null);
    } catch (e) { done('Этот браузер не смог подключиться к игре. Откройте страницу на компьютере и подключите его к телевизору по HDMI.'); }
  }
  function category(id) {
    for (var i = 0; i < pack.categories.length; i++) {
      if (pack.categories[i].id === id) return pack.categories[i];
    }
    return null;
  }
  function question(id) {
    for (var i = 0; i < pack.categories.length; i++) {
      var items = pack.categories[i].questions;
      for (var j = 0; j < items.length; j++) {
        if (items[j].id === id) return { question: items[j], category: pack.categories[i] };
      }
    }
    return null;
  }
  function contains(items, value) {
    for (var i = 0; i < items.length; i++) if (items[i] === value) return true;
    return false;
  }
  function image(path, alt, parent, onload) {
    var img = el('img', '', null, parent);
    img.alt = alt || 'Изображение к вопросу';
    img.onerror = function () { showError('Фото не загрузилось. Проверьте интернет и нажмите «Обновить подключение».'); };
    if (onload) img.onload = onload;
    img.src = './' + path.replace(/\.webp$/, '.jpg');
    return img;
  }
  function mediaView(media, parent) {
    var box = el('div', 'tv-media', null, parent);
    var width = document.documentElement.clientWidth || 1280;
    var height = window.innerHeight || document.documentElement.clientHeight || 720;
    var maxHeight = Math.max(150, Math.floor(height * 0.40));
    var i;
    if (media.kind === 'photo_rebus') {
      var panels = media.panels || [];
      var tokens = media.tokens || [];
      for (i = 0; i < tokens.length; i++) el('span', 'tv-plus', tokens[i], box);
      for (i = 0; i < panels.length; i++) {
        if (i > 0) el('span', 'tv-plus', media.joiner || '+', box);
        var panel = el('div', 'tv-rebus-panel', null, box);
        panel.style.width = Math.max(90, Math.min(300, width * 0.75 / Math.max(1, panels.length) - 32)) + 'px';
        if (panels[i].replace_letters) el('div', 'tv-operation', panels[i].replace_letters, panel);
        image(panels[i].path, 'Фотография ' + (i + 1) + ' для ребуса', panel);
        if (panels[i].trim_end) {
          var trim = '';
          for (var j = 0; j < panels[i].trim_end; j++) trim += '’';
          el('span', 'tv-trim', trim, panel);
        }
      }
      return null;
    }
    var frame = el('div', 'tv-picture', null, box);
    frame.style.width = Math.min(680, width * 0.7) + 'px';
    image(media.path, media.question_alt, frame, function () {
      if (this.naturalWidth && this.naturalHeight) {
        frame.style.width = Math.min(680, width * 0.7, maxHeight * this.naturalWidth / this.naturalHeight) + 'px';
      }
    });
    var masks = media.question_masks_normalized || [];
    var cover = [];
    for (i = 0; i < masks.length; i++) {
      var mask = el('span', 'tv-mask', null, frame);
      mask.style.left = masks[i][0] * 100 + '%';
      mask.style.top = masks[i][1] * 100 + '%';
      mask.style.width = masks[i][2] * 100 + '%';
      mask.style.height = masks[i][3] * 100 + '%';
      el('b', '', '?', mask);
      cover.push(mask);
    }
    return { frame: frame, cover: cover, visible: true };
  }
  function signed(value) {
    return value > 0 ? '+' + value : value < 0 ? '−' + Math.abs(value) : '0';
  }
  function rankPlayers(items) {
    var sorted = items.map(function (player, index) { return { player: player, index: index }; });
    sorted.sort(function (a, b) { return b.player.score - a.player.score || a.index - b.index; });
    var rank = 0;
    return sorted.map(function (item, index) {
      if (index === 0 || item.player.score !== sorted[index - 1].player.score) rank = index + 1;
      return { player: item.player, rank: rank };
    });
  }
  function photoIcon(parent) {
    var ns = 'http://www.w3.org/2000/svg';
    if (!document.createElementNS) return;
    var icon = document.createElementNS(ns, 'svg');
    icon.setAttribute('class', 'tv-photo-icon');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-label', 'Категория с картинками');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M3 4h18v16H3z M4 17l4-4 3 3 4-5 5 5 M9 8v2');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#f4bd62');
    path.setAttribute('stroke-width', '2');
    icon.appendChild(path);
    parent.appendChild(icon);
  }
  function showRespondent() {
    var label = document.getElementById('tv-respondent');
    if (!label || !snapshot) return;
    var name = '';
    var state = snapshot.state;
    if (state.inputRound) return;
    if (buzzer && buzzer.question_id === state.activeQuestionId && buzzer.claimant) {
      for (var i = 0; i < state.players.length; i++) {
        if (state.players[i].id === buzzer.claimant) name = state.players[i].name;
      }
    }
    text(label, name ? 'Отвечает ' + name : 'Кто первый?');
    label.className = name ? 'tv-respondent active' : 'tv-respondent';
  }
  function syncWakeLock() {
    if (typeof navigator === 'undefined' || !navigator.wakeLock) return;
    if (!snapshot || snapshot.state.phase === 'finished' || document.hidden) {
      if (wakeLock && !wakeLock.released) wakeLock.release().then(function () {}, function () {});
      wakeLock = null;
      return;
    }
    if (wakePending || (wakeLock && !wakeLock.released)) return;
    wakePending = true;
    navigator.wakeLock.request('screen').then(function (lock) {
      wakePending = false;
      wakeLock = lock;
      if (snapshot.state.phase === 'finished' || document.hidden) syncWakeLock();
    }, function () { wakePending = false; });
  }
  function fitBoard() {
    var table = document.getElementById('tv-category-table');
    var footer = document.getElementById('tv-footer');
    if (!table || !table.getBoundingClientRect || !footer) return;
    var top = table.getBoundingClientRect().top;
    var available = (window.innerHeight || document.documentElement.clientHeight) - top - footer.offsetHeight - 27;
    table.style.height = Math.max(0, Math.min(available, table.rows.length * 72)) + 'px';
  }
  function timerCue(id, seconds) {
    var key = id + ':' + seconds;
    if (!timerSound || !timerAudio || key === previousCue) return;
    previousCue = key;
    function note(frequency, offset, duration) {
      var osc = timerAudio.createOscillator();
      var gain = timerAudio.createGain();
      var start = timerAudio.currentTime + offset;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.08, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(timerAudio.destination);
      osc.start(start);
      osc.stop(start + duration);
    }
    if (seconds) note(seconds === 1 ? 784 : 659, 0, 0.13);
    else { note(523, 0, 0.29); note(349, 0.13, 0.46); }
  }
  function updateTimer() {
    if (!timerView) return;
    var left = Math.max(0, Math.min(25000, timerView.deadline - new Date().getTime()));
    var seconds = Math.ceil(left / 1000);
    if (timerView.seconds !== seconds) {
      timerView.seconds = seconds;
      text(timerView.number, (seconds < 10 ? '0' : '') + seconds);
      timerView.face.className = 'tv-estimate-clock' + (seconds <= 5 ? ' urgent' : '');
    }
    timerView.fill.style.width = (left / 250) + '%';
    if (seconds <= 5) timerCue(timerView.id, seconds);
  }
  function showTimer(round, parent) {
    var face = el('div', 'tv-estimate-clock', null, parent);
    var number = el('strong', '', '', face);
    el('span', '', ' сек', face);
    var bar = el('div', 'tv-estimate-track', null, face);
    var fill = el('div', 'tv-estimate-fill', null, bar);
    timerView = {id:round.id, deadline:round.deadline, face:face, number:number, fill:fill};
    updateTimer();
  }
  function showProgress(state, parent) {
    var round = state.inputRound;
    if (!round) return;
    el('p', 'tv-progress', formatLabels[round.stage], parent);
    if (typeof round.deadline === 'number' && !round.closed) showTimer(round, parent);
    if (round.stage === 'turns') {
      var active = round.queue[round.turn];
      var player = state.players.filter(function (p) { return p.id === active; })[0];
      el('p', 'tv-progress', 'Ход игрока ' + (player ? player.name : ''), parent);
    } else {
      var list = el('ul', 'tv-shared', null, parent);
      state.players.forEach(function (player) {
        var done = contains(round.submitted, player.id);
        el('li', done ? 'tv-submitted' : '', (done ? '✓ ' : '') + player.name, list);
      });
    }
    if (round.options) {
      var options = el('ul', 'tv-shared', null, parent);
      round.options.forEach(function (option) {
        el('li', contains(round.eliminated || [], option.id) ? 'tv-eliminated' : '', option.label, options);
      });
    }
  }
  function showResults(state, parent) {
    var list = el('ul', 'tv-shared', null, parent);
    if (!state.results.length) el('li', '', 'Никто не ответил', list);
    state.players.forEach(function (player) {
      state.results.forEach(function (result) {
        if (result.playerId !== player.id) return;
        var value = result.input == null ? (result.timedOut ? 'не успел ответить' : 'без ответа') : result.input;
        var wager = typeof result.wager === 'number' ? ' · ставка ' + result.wager : '';
        el('li', '', player.name + ' · ' + value + wager + ' · ' + signed(result.delta), list);
      });
    });
  }
  function renderFinal(state) {
    var final = state.final;
    var section = el('div', 'tv-center tv-final', null, content);
    el('h1', '', 'Финальный вопрос', section);
    var categories = pack.finals || [];
    if (final.stage === 'category') {
      var chooser = state.players.filter(function (player) { return player.id === final.chooser; })[0];
      el('p', '', 'Категорию выбирает ' + (chooser ? chooser.name : ''), section);
      categories.forEach(function (topic) { el('p', '', topic.title, section); });
      return;
    }
    var topic = categories.filter(function (category) { return category.id === final.categoryId; })[0];
    if (topic) el('p', '', topic.title, section);
    if (final.stage === 'written') el('h2', '', final.prompt, section);
    if (final.stage === 'result' && state.revealed) {
      el('h2', '', state.revealed.answer, section);
      el('p', '', state.revealed.explanation, section);
      showResults(state, section);
    } else {
      showProgress(state, section);
    }
  }
  function renderQuestion(state, roundIds) {
    var found = question(state.activeQuestionId);
    if (!found) { text(content, 'Вопрос не найден. Обновите страницу.'); return; }
    var q = found.question;
    var value = state.activeQuestionValue == null ? q.value : state.activeQuestionValue;
    if (!questionView || questionView.id !== q.id || questionView.value !== value) {
      text(content, '');
      var section = el('div', 'tv-question tv-price-' + value, null, content);
      var categoryNumber = roundIds.indexOf(found.category.id) + 1;
      var questionLabel = el('div', 'tv-question-label tv-category-' + ((categoryNumber - 1) % 5 + 1), null, section);
      if (categoryNumber > 0) el('span', 'tv-category-number', categoryNumber, questionLabel);
      el('strong', '', found.category.title, questionLabel);
      el('span', 'tv-question-value', value, questionLabel);
      var prompt = el('h1', '', q.prompt, section);
      var answer = el('div', 'tv-question-answer', null, section);
      var media = q.media ? mediaView(q.media, section) : null;
      var response = el('p', 'tv-respondent', '', section);
      response.id = 'tv-respondent';
      var details = el('div', 'tv-shared-details', null, section);
      questionView = { id: q.id, value: value, prompt: prompt, answer: answer, media: media, response: response, details: details };
      window.scrollTo(0, 0);
    }
    var view = questionView;
    var show = state.phase === 'answer' && state.revealed;
    view.prompt.style.display = show ? 'none' : '';
    view.answer.style.display = show ? '' : 'none';
    view.response.style.display = show || state.inputRound ? 'none' : '';
    text(view.details, '');
    if (show) {
      text(view.answer, '');
      el('h2', '', state.revealed.answer, view.answer);
      el('p', '', state.revealed.explanation, view.answer);
      var award = 'В этот раз без баллов';
      for (var i = 0; i < state.players.length; i++) if (state.players[i].id === state.winnerId) award = '+' + value + ' · ' + state.players[i].name;
      if (state.results) showResults(state, view.details);
      else el('p', 'tv-award', award, view.answer);
    } else if (state.inputRound) {
      showProgress(state, view.details);
    } else {
      if (state.hint) el('p', 'tv-progress', 'Подсказка · ' + state.hint, view.details);
      showRespondent();
    }
    if (view.media && view.media.visible === !!show) {
      var cover = view.media.cover;
      var frame = view.media.frame;
      for (var j = 0; j < cover.length; j++) {
        if (show) frame.removeChild(cover[j]);
        else frame.appendChild(cover[j]);
      }
      view.media.visible = !show;
    }
  }
  function render() {
    if (!pack || !snapshot) return;
    timerView = null;
    var state = snapshot.state;
    if (state.phase === 'answer' && state.inputRound && state.results && state.results.some(function (result) { return result.timedOut; })) timerCue(state.inputRound.id, 0);
    var boardPhase = state.phase === 'board';
    var roundPhase = boardPhase || state.phase === 'question' || state.phase === 'answer';
    document.documentElement.className = 'tv-stage tv-phase-' + state.phase + (roundPhase ? ' tv-round' : '') + (boardPhase ? ' tv-category-phase' : '');
    var roundIds = state.categoryIds && state.categoryIds.length ? state.categoryIds : pack.rounds[0].category_ids.slice(0,10);
    var ranked = rankPlayers(state.players);
    var chooser = state.players[state.turnIndex];
    var i;
    players.className = roundPhase && ranked.length > 4 ? 'tv-many-players' : '';
    text(players, '');
    if (state.phase !== 'lobby' && state.phase !== 'finished') {
      for (i = 0; i < ranked.length; i++) {
        var player = ranked[i].player;
        var choosing = boardPhase && chooser && chooser.id === player.id;
        var cell = el('div', 'tv-player' + (choosing ? ' tv-choosing' : '') + (player.id === state.winnerId ? ' tv-scored' : ''), null, players);
        var row = el('div', 'tv-score-row', null, cell);
        var badge = el('div', 'tv-crown-slot', null, row);
        if (ranked[i].rank <= 3) el('b', 'tv-board-crown ' + ranks[ranked[i].rank], '♛', badge);
        var scores = el('div', 'tv-score-body', null, row);
        el('span', '', player.name, scores);
        el('strong', '', player.score, scores);
        var deltaSlot = el('div', 'tv-delta-slot', null, row);
        var change = state.scoreChanges && state.scoreChanges[player.id];
        if (typeof change === 'number') el('small', 'tv-delta' + (change > 0 ? ' tv-positive' : change < 0 ? ' tv-negative' : ''), signed(change), deltaSlot);
      }
    }
    if (state.phase === 'question' || state.phase === 'answer') {
      renderQuestion(state, roundIds);
      return;
    }
    questionView = null;
    text(content, '');
    if (state.phase === 'lobby') {
      var lobby = el('div', 'tv-lobby', null, content);
      var qrCard = el('div', 'tv-lobby-qr', null, lobby);
      var join = el('a', '', null, qrCard);
      join.href = './?mode=player';
      if (join.href === pack.tvJoinUrl) {
        var qr = el('img', '', null, join);
        qr.src = './content/tv-join.png';
        qr.alt = 'QR-код для входа в игру';
        el('p', '', 'Сканируйте, чтобы войти', qrCard);
      } else {
        text(join, 'Ссылка для игроков');
      }
      var room = el('div', 'tv-lobby-room', null, lobby);
      el('h1', '', 'Кто первый?', room);
      var rosterBox = el('div', 'tv-lobby-roster', null, room);
      el('h2', '', 'Игроки · ' + lobbyRoster.length, rosterBox);
      if (!lobbyRoster.length) el('p', '', 'Ждём игроков…', rosterBox);
      for (i = 0; i < lobbyRoster.length; i++) el('strong', '', lobbyRoster[i].name, rosterBox);
    } else if (state.phase === 'board') {
      var ids = roundIds;
      var pageCount = Math.ceil(ids.length / 10);
      var page = Math.max(0, Math.min(pageCount - 1, state.boardPage || 0));
      var selection = el('div', 'tv-board-chooser', null, content);
      var heading = el('h1', '', null, selection);
      text(heading, 'Выбирает ');
      el('strong', '', chooser ? chooser.name : '', heading);
      if (pageCount > 1) el('p', 'tv-meta', 'Страница ' + (page + 1) + ' из ' + pageCount, content);
      ids = ids.slice(page * 10, (page + 1) * 10);
      var table = el('table', 'tv-board' + (ids.length > 6 ? ' tv-board-dense' : ''), null, content);
      table.id = 'tv-category-table';
      var body = el('tbody', '', null, table);
      for (i = 0; i < ids.length; i++) {
        var cat = category(ids[i]);
        if (!cat) continue;
        var questions = [];
        for (var slot = 0; slot < 5; slot++) {
          var selectedId = state.selectedQuestions && state.selectedQuestions[(page * 10 + i) * 5 + slot];
          var price = (slot + 1) * 100;
          for (var candidate = 0; candidate < cat.questions.length; candidate++) {
            var item = cat.questions[candidate];
            if (state.selectedQuestions ? item.id === selectedId : item.value === price) {
              questions.push({id:item.id,value:price});
              break;
            }
          }
        }
        var used = 0;
        var k;
        for (k = 0; k < questions.length; k++) if (contains(state.completed, questions[k].id)) used++;
        var row = el('tr', '', null, body);
        var number = page * 10 + i + 1;
        var title = el('th', 'tv-category-' + ((number - 1) % 5 + 1), null, row);
        el('span', 'tv-category-number', number, title);
        el('strong', '', cat.title, title);
        if (cat.questions.length && cat.questions.every(function (item) { return !item.type || item.type === 'buzzer'; }) && cat.questions.every(function (item) { return !!item.media; })) photoIcon(title);
        var kind = cat.questions[0] && cat.questions[0].type;
        if (formatIcons[kind] && cat.questions.every(function (item) { return item.type === kind; })) {
          var icon = el('span', 'tv-format-icon', formatIcons[kind], title);
          icon.title = formatLabels[kind];
        }
        for (k = 0; k < questions.length; k++) {
          var blank = contains(state.completed, questions[k].id) || used >= state.questionsPerCategory;
          el('td', blank ? 'tv-used' : 'tv-price-' + questions[k].value, blank ? '' : questions[k].value, row);
        }
      }
      fitBoard();
    } else if (state.phase === 'final' && state.final) {
      renderFinal(state);
    } else if (state.phase === 'break') {
      var pause = el('div', 'tv-center', null, content);
      el('p', '', 'Первый раунд завершён', pause);
      el('h1', '', 'Перерыв', pause);
    } else if (state.phase === 'finished') {
      var winner = el('div', 'tv-winner', null, content);
      var firstPlace = ranked.filter(function (item) { return item.rank === 1; });
      el('h1', '', firstPlace.length > 1 ? 'Победители' : 'Победитель', winner);
      var podium = el('div', 'tv-podium', null, winner);
      var order = [2, 1, 3];
      for (i = 0; i < order.length; i++) {
        var rank = order[i];
        var placed = ranked.filter(function (item) { return item.rank === rank; });
        if (!placed.length) continue;
        var card = el('div', 'tv-podium-place tv-podium-' + rank, null, podium);
        el('b', 'tv-podium-crown ' + ranks[rank], '♛', card);
        el('small', '', rank + '-е место', card);
        el('h2', '', placed.map(function (item) { return item.player.name; }).join(' · '), card);
        el('p', '', placed[0].player.score + ' баллов', card);
      }
      var others = ranked.filter(function (item) { return item.rank > 3; });
      if (others.length) {
        var standings = el('table', 'tv-standings', null, content);
        var rows = el('tbody', '', null, standings);
        for (i = 0; i < others.length; i++) {
          var standing = el('tr', '', null, rows);
          el('td', '', others[i].rank + '. ' + others[i].player.name, standing);
          el('td', 'tv-score', others[i].player.score, standing);
        }
      }

    }
    window.scrollTo(0, 0);
  }
  function refresh() {
    if (pending) return;
    if (!config.url || !config.key) { showError('Подключение не настроено. Нужна повторная сборка сайта с настройками Supabase.'); return; }
    pending = true;
    // Read-only anonymous access, identical RLS policy to the main display.
    // No auth SDK, sessions, WebSocket, login credentials or private answers.
    request(config.url.replace(/\/$/, '') + '/rest/v1/quiz_game?id=eq.main&select=id,state,revision', true, function (error, rows) {
      pending = false;
      if (error) { text(status, 'Переподключаемся…'); showError(error); return; }
      if (!rows || !rows.length || !rows[0].state) { showError('Игра пока не создана или нет доступа к экрану.'); return; }
      var incoming = rows[0];
      if (incoming.revision >= revision) {
        snapshot = incoming;
        if (incoming.revision !== revision && pack) { render(); syncWakeLock(); }
        revision = incoming.revision;
      }
      text(status, 'В эфире');
      showError('');
      if (snapshot.state.phase === 'lobby' && !rosterRequest) {
        rosterRequest = true;
        request(config.url.replace(/\/$/, '') + '/rest/v1/quiz_participants?select=id,name&order=joined_at.asc,id.asc', true, function (rosterError, roster) {
          rosterRequest = false;
          if (rosterError || !roster || snapshot.state.phase !== 'lobby') return;
          if (JSON.stringify(roster) === JSON.stringify(lobbyRoster)) return;
          lobbyRoster = roster;
          render();
        });
      }
      if (snapshot.state.phase === 'question' && !responseRequest) {
        responseRequest = true;
        request(config.url.replace(/\/$/, '') + '/rest/v1/quiz_buzzer?id=eq.main&select=question_id,claimant', true, function (buzzerError, buttonRows) {
          responseRequest = false;
          if (buzzerError || !buttonRows || !buttonRows.length) return;
          buzzer = buttonRows[0];
          showRespondent();
        });
      } else if (snapshot.state.phase !== 'question') {
        buzzer = null;
      }
    });
  }
  var loadingPack = false;
  function loadPack() {
    if (pack || loadingPack) return;
    loadingPack = true;
    request('./content/questions.json', false, function (error, data) {
      loadingPack = false;
      if (error) { showError(error); return; }
      if (!data || !data.categories || !data.rounds) { showError('Не удалось прочитать пакет вопросов.'); return; }
      pack = data;
      render();
      syncWakeLock();
    });
  }
  var soundButton = document.getElementById('tv-timer-sound');
  if (soundButton) {
    var TimerAudio = window.AudioContext || window.webkitAudioContext;
    if (!TimerAudio) soundButton.style.display = 'none';
    else soundButton.onclick = function () {
      timerAudio = timerAudio || new TimerAudio();
      if (timerAudio.resume) timerAudio.resume();
      timerSound = !timerSound;
      text(soundButton, timerSound ? 'Выключить звук таймера' : 'Включить звук таймера');
    };
  }
  window.setInterval(updateTimer, 100);
  document.getElementById('tv-retry').onclick = function () { loadPack(); revision = -1; refresh(); };
  if (document.addEventListener) {
    document.addEventListener('visibilitychange', syncWakeLock);
    document.addEventListener('click', syncWakeLock);
  }
  if (window.addEventListener) window.addEventListener('resize', fitBoard);
  loadPack();
  refresh();
  window.setInterval(function () { loadPack(); refresh(); }, 2000);
}());
