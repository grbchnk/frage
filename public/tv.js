/* ES5 only. Intentionally independent of React, modules, fetch and WebSocket. */
(function () {
  'use strict';
  var config = window.QUIZ_TV_CONFIG || {};
  var pack = null;
  var snapshot = null;
  var pending = false;
  var revision = -1;
  var content = document.getElementById('tv-content');
  var players = document.getElementById('tv-players');
  var errorBox = document.getElementById('tv-error');
  var status = document.getElementById('tv-status');
  var colors = ['#bdf684', '#afcaff', '#f7b0ce', '#ffd28c', '#c7b7ff', '#81ddd2', '#f4a48d', '#c4d5a0', '#fff3b0', '#bec6df'];

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
  function mediaView(media, revealed, parent) {
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
      return;
    }
    var frame = el('div', 'tv-picture', null, box);
    frame.style.width = Math.min(680, width * 0.7) + 'px';
    image(media.path, media.question_alt, frame, function () {
      if (this.naturalWidth && this.naturalHeight) {
        frame.style.width = Math.min(680, width * 0.7, maxHeight * this.naturalWidth / this.naturalHeight) + 'px';
      }
    });
    var masks = revealed ? [] : (media.question_masks_normalized || []);
    for (i = 0; i < masks.length; i++) {
      var mask = el('span', 'tv-mask', null, frame);
      mask.style.left = masks[i][0] * 100 + '%';
      mask.style.top = masks[i][1] * 100 + '%';
      mask.style.width = masks[i][2] * 100 + '%';
      mask.style.height = masks[i][3] * 100 + '%';
      el('b', '', '?', mask);
    }
  }
  function render() {
    if (!pack || !snapshot) return;
    var state = snapshot.state;
    var i;
    text(players, '');
    if (state.phase !== 'lobby') {
      for (i = 0; i < state.players.length; i++) {
        var player = state.players[i];
        var cell = el('div', 'tv-player' + (state.phase === 'board' && i === state.turnIndex ? ' tv-choosing' : '') + (player.id === state.winnerId ? ' tv-scored' : ''), null, players);
        el('span', '', player.name, cell).style.color = colors[i % colors.length];
        el('strong', '', player.score, cell);
      }
    }
    text(content, '');
    if (state.phase === 'lobby') {
      var lobby = el('div', 'tv-center', null, content);
      el('h1', '', 'ВИКТОРИНА У АЛИНЫ ДОМА', lobby);
      el('p', '', '20 тем · 2 раунда · 100 вопросов', lobby);
      el('p', '', 'Ожидаем ведущего', lobby);
    } else if (state.phase === 'board') {
      var chooser = state.players[state.turnIndex];
      el('h2', '', 'Раунд ' + (state.roundIndex + 1) + ' / 2', content);
      el('p', 'tv-meta', 'Выбирает: ' + (chooser ? chooser.name : ''), content);
      var table = el('table', 'tv-board', null, content);
      var body = el('tbody', '', null, table);
      var ids = pack.rounds[state.roundIndex].category_ids;
      for (i = 0; i < ids.length; i++) {
        var cat = category(ids[i]);
        if (!cat) continue;
        var used = 0;
        var k;
        for (k = 0; k < cat.questions.length; k++) if (contains(state.completed, cat.questions[k].id)) used++;
        var row = el('tr', '', null, body);
        el('th', '', cat.title + (state.questionsPerCategory === 3 ? ' (' + used + '/3)' : ''), row);
        for (k = 0; k < cat.questions.length; k++) {
          var played = contains(state.completed, cat.questions[k].id);
          el('td', played || used >= state.questionsPerCategory ? 'tv-used' : '', played ? '—' : cat.questions[k].value, row);
        }
      }
    } else if (state.phase === 'question' || state.phase === 'answer') {
      var found = question(state.activeQuestionId);
      if (!found) { el('p', '', 'Вопрос не найден. Обновите страницу.', content); return; }
      var q = found.question;
      var section = el('div', 'tv-question', null, content);
      var meta = el('div', 'tv-meta', found.category.title + ' · ' + q.value + ' баллов', section);
      if (state.phase === 'question') el('span', 'tv-clock', '', meta).id = 'tv-clock';
      el('h1', '', q.prompt, section);
      if (state.phase === 'answer' && state.revealed) {
        el('h2', '', state.revealed.answer, section);
        el('p', '', state.revealed.explanation, section);
        var award = 'В этот раз без баллов';
        for (i = 0; i < state.players.length; i++) if (state.players[i].id === state.winnerId) award = '+' + q.value + ' · ' + state.players[i].name;
        el('p', 'tv-award', award, section);
      }
      if (q.media) mediaView(q.media, state.phase === 'answer', section);
    } else if (state.phase === 'break') {
      var pause = el('div', 'tv-center', null, content);
      el('p', '', 'Первый раунд завершён', pause);
      el('h1', '', 'Перерыв', pause);
      el('span', 'tv-clock-large', '', pause).id = 'tv-clock';
    } else if (state.phase === 'finished') {
      var sorted = state.players.slice().sort(function (a, b) { return b.score - a.score; });
      var names = [];
      for (i = 0; i < sorted.length; i++) if (sorted[i].score === sorted[0].score) names.push(sorted[i].name);
      el('h1', '', names.length > 1 ? 'Победители' : 'Победитель', content);
      el('h2', 'tv-award', names.join(' и '), content);
      var standings = el('table', 'tv-standings', null, content);
      var rows = el('tbody', '', null, standings);
      var rank = 1;
      for (i = 0; i < sorted.length; i++) {
        if (i === 0 || sorted[i].score !== sorted[i - 1].score) rank = i + 1;
        var standing = el('tr', '', null, rows);
        el('td', '', rank + '. ' + sorted[i].name, standing);
        el('td', 'tv-score', sorted[i].score, standing);
      }
    }
    tick();
    window.scrollTo(0, 0);
  }
  function tick() {
    var clock = document.getElementById('tv-clock');
    if (!clock || !snapshot) return;
    var state = snapshot.state;
    var end = state.phase === 'break' ? state.breakEndsAt : state.questionEndsAt;
    var seconds = end ? Math.max(0, Math.ceil((end - new Date().getTime()) / 1000)) : 0;
    var minutes = Math.floor(seconds / 60);
    var remainder = seconds % 60;
    text(clock, (minutes < 10 ? '0' : '') + minutes + ':' + (remainder < 10 ? '0' : '') + remainder);
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
        if (incoming.revision !== revision && pack) render();
        revision = incoming.revision;
      }
      text(status, 'В эфире');
      showError('');
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
    });
  }
  document.getElementById('tv-retry').onclick = function () { loadPack(); revision = -1; refresh(); };
  loadPack();
  refresh();
  window.setInterval(function () { loadPack(); refresh(); }, 2000);
  window.setInterval(tick, 250);
}());
