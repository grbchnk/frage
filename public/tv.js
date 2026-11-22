/* ES5 only. Intentionally independent of React, modules, fetch and WebSocket. */
(function () {
  'use strict';
  var config = window.QUIZ_TV_CONFIG || {};
  var pack = null;
  var snapshot = null;
  var pending = false;
  var revision = -1;
  var lastFeedback = -1;
  var buzzer = null;
  var responseRequest = false;
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
    if (buzzer && buzzer.question_id === state.activeQuestionId && buzzer.claimant) {
      for (var i = 0; i < state.players.length; i++) {
        if (state.players[i].id === buzzer.claimant) name = state.players[i].name;
      }
    }
    text(label, name ? 'Отвечает ' + name : 'Кто первый нажмёт?');
    label.className = name ? 'tv-respondent active' : 'tv-respondent';
  }
  function flash(feedback) {
    if (!feedback || feedback.event === lastFeedback) return;
    lastFeedback = feedback.event;
    if (new Date().getTime() - feedback.at > 2800) return;
    var overlay = document.getElementById('tv-flash');
    if (!overlay) return;
    overlay.className = feedback.kind === 'correct' ? 'tv-flash-correct' : 'tv-flash-wrong';
    window.setTimeout(function () {
      if (lastFeedback === feedback.event) overlay.className = '';
    }, 1300);
  }
  function render() {
    if (!pack || !snapshot) return;
    var state = snapshot.state;
    var boardPhase = state.phase === 'board';
    document.documentElement.className = boardPhase ? 'tv-category-phase' : '';
    var ranked = rankPlayers(state.players);
    var chooser = state.players[state.turnIndex];
    var i;
    text(players, '');
    if (state.phase !== 'lobby' && state.phase !== 'finished') {
      for (i = 0; i < ranked.length; i++) {
        var player = ranked[i].player;
        var choosing = boardPhase && chooser && chooser.id === player.id;
        var cell = el('div', 'tv-player' + (choosing ? ' tv-choosing' : '') + (player.id === state.winnerId ? ' tv-scored' : ''), null, players);
        if (boardPhase) {
          if (ranked[i].rank === 1) el('b', 'tv-board-leader', '♛', cell);
        } else {
          el('b', 'tv-place ' + (ranks[ranked[i].rank] || ''), ranked[i].rank, cell);
        }
        el('span', '', player.name, cell);
        el('strong', '', player.score, cell);
        var change = state.scoreChanges && state.scoreChanges[player.id];
        if (typeof change === 'number') el('small', 'tv-delta' + (change > 0 ? ' tv-positive' : change < 0 ? ' tv-negative' : ''), signed(change), cell);
      }
    }
    text(content, '');
    if (state.phase === 'lobby') {
      var lobby = el('div', 'tv-center', null, content);
      el('h1', '', 'Кто первый?', lobby);
      el('p', '', pack.categories.length + ' тем в банке', lobby);
      el('p', '', 'Ожидаем ведущего', lobby);
    } else if (state.phase === 'board') {
      var ids = state.categoryIds && state.categoryIds.length ? state.categoryIds : pack.rounds[0].category_ids.slice(0,10);
      var pageCount = Math.ceil(ids.length / 10);
      var page = Math.max(0, Math.min(pageCount - 1, state.boardPage || 0));
      var selection = el('div', 'tv-board-chooser', null, content);
      el('p', '', 'Сейчас выбирает категорию', selection);
      el('h1', '', chooser ? chooser.name : '', selection);
      if (pageCount > 1) el('p', 'tv-meta', 'Страница ' + (page + 1) + ' из ' + pageCount, content);
      ids = ids.slice(page * 10, (page + 1) * 10);
      var frame = el('div', 'tv-board-frame', null, content);
      var table = el('table', 'tv-board' + (ids.length > 6 ? ' tv-board-dense' : ''), null, frame);
      var body = el('tbody', '', null, table);
      for (i = 0; i < ids.length; i++) {
        var cat = category(ids[i]);
        if (!cat) continue;
        var used = 0;
        var k;
        for (k = 0; k < cat.questions.length; k++) if (contains(state.completed, cat.questions[k].id)) used++;
        var row = el('tr', '', null, body);
        var number = page * 10 + i + 1;
        var title = el('th', 'tv-category-' + ((number - 1) % 5 + 1), null, row);
        el('span', 'tv-category-number', number, title);
        el('strong', '', cat.title, title);
        if (cat.questions.some(function (item) { return !!item.media; })) photoIcon(title);
        for (k = 0; k < cat.questions.length; k++) {
          var blank = contains(state.completed, cat.questions[k].id) || used >= state.questionsPerCategory;
          el('td', blank ? 'tv-used' : 'tv-price-' + cat.questions[k].value, blank ? '' : cat.questions[k].value, row);
        }
      }
    } else if (state.phase === 'question' || state.phase === 'answer') {
      var found = question(state.activeQuestionId);
      if (!found) { el('p', '', 'Вопрос не найден. Обновите страницу.', content); return; }
      var q = found.question;
      var section = el('div', 'tv-question', null, content);
      el('div', 'tv-meta', found.category.title + ' · ' + q.value + ' баллов', section);
      el('h1', '', q.prompt, section);
      if (state.phase === 'answer' && state.revealed) {
        el('h2', '', state.revealed.answer, section);
        el('p', '', state.revealed.explanation, section);
        var award = 'В этот раз без баллов';
        for (i = 0; i < state.players.length; i++) if (state.players[i].id === state.winnerId) award = '+' + q.value + ' · ' + state.players[i].name;
        el('p', 'tv-award', award, section);
      }
      if (q.media) mediaView(q.media, state.phase === 'answer', section);
      if (state.phase === 'question') el('p', 'tv-respondent', '', section).id = 'tv-respondent';
      showRespondent();
      flash(state.feedback);
    } else if (state.phase === 'break') {
      var pause = el('div', 'tv-center', null, content);
      el('p', '', 'Первый раунд завершён', pause);
      el('h1', '', 'Перерыв', pause);
    } else if (state.phase === 'finished') {
      var names = [];
      for (i = 0; i < ranked.length && ranked[i].rank === 1; i++) names.push(ranked[i].player.name);
      var winner = el('div', 'tv-winner', null, content);
      el('h1', '', names.length > 1 ? 'Победители' : 'Победитель', winner);
      el('h2', 'tv-award', names.join(' · '), winner);
      if (ranked.length) el('p', '', ranked[0].player.score + ' баллов', winner);
      var standings = el('table', 'tv-standings', null, content);
      var rows = el('tbody', '', null, standings);
      for (i = 0; i < ranked.length; i++) {
        var standing = el('tr', '', null, rows);
        el('td', ranks[ranked[i].rank] || '', ranked[i].rank + '. ' + ranked[i].player.name, standing);
        el('td', 'tv-score', ranked[i].player.score, standing);
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
        if (incoming.revision !== revision && pack) render();
        revision = incoming.revision;
      }
      text(status, 'В эфире');
      showError('');
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
    });
  }
  document.getElementById('tv-retry').onclick = function () { loadPack(); revision = -1; refresh(); };
  loadPack();
  refresh();
  window.setInterval(function () { loadPack(); refresh(); }, 2000);
}());
