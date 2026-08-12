(() => {
  const STORAGE_KEY = '5x5_cs_dust2_map_report_v1';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MAP_TRANSFORM = Object.freeze({
    posX: -2476,
    posY: 3239,
    scale: 4.4,
    width: 1024,
    height: 1024
  });

  const TOOL_TYPES = Object.freeze({
    blocked: {
      label: 'Geçilemez / duvar',
      shortLabel: 'GEÇİLEMEZ',
      color: '#ff4057',
      icon: '⛔',
      description: 'Oyuncunun geçmemesi gereken duvar, yükseklik veya kapalı bağlantı.'
    },
    route: {
      label: 'Doğru rota',
      shortLabel: 'DOĞRU ROTA',
      color: '#2ea8ff',
      icon: '➜',
      description: 'Oyuncunun tercih etmesini istediğin gerçek yürüyüş rotası.'
    },
    jump: {
      label: 'Zıplama / boost',
      shortLabel: 'ZIPLAMA',
      color: '#ffd629',
      icon: '↥',
      description: 'Yalnızca kutu, zıplama veya takım boostu ile aşılabilen bağlantı.'
    },
    sightline: {
      label: 'AWP görüş hattı',
      shortLabel: 'AWP HATTI',
      color: '#ff8a2a',
      icon: '⌖',
      description: 'Açık görüşte tehlike oluşturan keskin nişancı veya erken temas hattı.',
      dash: [14, 10]
    },
    note: {
      label: 'Diğer not',
      shortLabel: 'NOT',
      color: '#bd7cff',
      icon: '✎',
      description: 'Diğer konum, alan veya davranış notları.'
    }
  });

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const round = (value, digits = 2) => Number(Number(value).toFixed(digits));

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function perpendicularDistance(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (!dx && !dy) return Math.hypot(point.x - start.x, point.y - start.y);
    const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / ((dx * dx) + (dy * dy)), 0, 1);
    return Math.hypot(point.x - (start.x + (t * dx)), point.y - (start.y + (t * dy)));
  }

  function simplifyPath(points, tolerance = 0.32) {
    if (!Array.isArray(points) || points.length <= 2) return points || [];
    let maxDistance = 0;
    let splitIndex = 0;
    for (let index = 1; index < points.length - 1; index += 1) {
      const distance = perpendicularDistance(points[index], points[0], points[points.length - 1]);
      if (distance > maxDistance) {
        maxDistance = distance;
        splitIndex = index;
      }
    }
    if (maxDistance <= tolerance) return [points[0], points[points.length - 1]];
    const left = simplifyPath(points.slice(0, splitIndex + 1), tolerance);
    const right = simplifyPath(points.slice(splitIndex), tolerance);
    return left.slice(0, -1).concat(right);
  }

  function mapToWorld(point) {
    const radarWorldSize = MAP_TRANSFORM.width * MAP_TRANSFORM.scale;
    return {
      x: round(MAP_TRANSFORM.posX + ((point.x / 100) * radarWorldSize), 1),
      y: round(MAP_TRANSFORM.posY - ((point.y / 100) * radarWorldSize), 1)
    };
  }

  function createSvgElement(tag, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  function pathData(points) {
    return (points || [])
      .map((point, index) => `${index ? 'L' : 'M'} ${round(point.x, 3)} ${round(point.y, 3)}`)
      .join(' ');
  }

  class Dust2MapReporter {
    constructor(root) {
      this.root = root;
      this.svg = root.querySelector('[data-cmr="canvas"]');
      this.annotationLayer = root.querySelector('[data-cmr="annotations"]');
      this.emptyState = root.querySelector('[data-cmr="empty"]');
      this.coordinateBadge = root.querySelector('[data-cmr="coordinates"]');
      this.annotationList = root.querySelector('[data-cmr="annotation-list"]');
      this.selectedPanel = root.querySelector('[data-cmr="selected-panel"]');
      this.selectedNote = root.querySelector('[data-cmr="selected-note"]');
      this.fileInput = root.querySelector('[data-cmr="file-input"]');
      this.annotations = [];
      this.selectedId = null;
      this.activeType = 'blocked';
      this.draftPoints = null;
      this.pointerId = null;
      this.nextId = 1;
      this.boundHandlers = [];
      this.loadDraft();
      this.bind();
      this.renderAll();
    }

    bindEvent(target, eventName, handler, options) {
      target?.addEventListener(eventName, handler, options);
      this.boundHandlers.push(() => target?.removeEventListener(eventName, handler, options));
    }

    bind() {
      this.root.querySelectorAll('[data-cmr-tool]').forEach(button => {
        this.bindEvent(button, 'click', () => this.setActiveType(button.dataset.cmrTool));
      });
      this.root.querySelectorAll('[data-cmr-action]').forEach(button => {
        this.bindEvent(button, 'click', () => this.handleAction(button.dataset.cmrAction));
      });
      this.root.querySelectorAll('[data-cmr-context]').forEach(input => {
        this.bindEvent(input, 'input', () => this.saveDraft());
        this.bindEvent(input, 'change', () => this.saveDraft());
      });
      this.bindEvent(this.selectedNote, 'input', () => {
        const selected = this.getSelected();
        if (!selected) return;
        selected.note = this.selectedNote.value.slice(0, 500);
        this.renderAnnotationList();
        this.saveDraft();
      });
      this.bindEvent(this.svg, 'pointerdown', event => this.pointerDown(event));
      this.bindEvent(this.svg, 'pointermove', event => this.pointerMove(event));
      this.bindEvent(this.svg, 'pointerup', event => this.pointerUp(event));
      this.bindEvent(this.svg, 'pointercancel', event => this.pointerUp(event));
      this.bindEvent(this.svg, 'pointerleave', () => {
        if (!this.draftPoints) this.coordinateBadge.classList.remove('is-visible');
      });
      this.bindEvent(this.svg, 'keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          this.undo();
        }
        if ((event.key === 'Delete' || event.key === 'Backspace') && this.selectedId !== null) {
          event.preventDefault();
          this.deleteAnnotation(this.selectedId);
        }
      });
      this.bindEvent(this.annotationList, 'click', event => {
        const deleteButton = event.target.closest('[data-cmr-delete]');
        if (deleteButton) {
          this.deleteAnnotation(Number(deleteButton.dataset.cmrDelete));
          return;
        }
        const item = event.target.closest('[data-cmr-select]');
        if (item) this.selectAnnotation(Number(item.dataset.cmrSelect));
      });
      this.bindEvent(this.fileInput, 'change', event => this.importReport(event.target.files?.[0]));
    }

    destroy() {
      this.boundHandlers.splice(0).forEach(unbind => unbind());
      this.saveDraft();
    }

    setActiveType(type) {
      if (!TOOL_TYPES[type]) return;
      this.activeType = type;
      this.root.querySelectorAll('[data-cmr-tool]').forEach(button => {
        const active = button.dataset.cmrTool === type;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      const help = this.root.querySelector('[data-cmr="tool-help"]');
      if (help) help.textContent = TOOL_TYPES[type].description;
      this.saveDraft();
    }

    pointFromEvent(event) {
      const point = this.svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const matrix = this.svg.getScreenCTM();
      if (!matrix) return null;
      const local = point.matrixTransform(matrix.inverse());
      return { x: clamp(local.x, 0, 100), y: clamp(local.y, 0, 100) };
    }

    pointerDown(event) {
      if (event.button !== undefined && event.button !== 0) return;
      const annotationTarget = event.target.closest?.('[data-annotation-id]');
      if (annotationTarget) {
        this.selectAnnotation(Number(annotationTarget.dataset.annotationId));
        return;
      }
      const point = this.pointFromEvent(event);
      if (!point) return;
      event.preventDefault();
      this.pointerId = event.pointerId;
      this.draftPoints = [point];
      this.svg.setPointerCapture?.(event.pointerId);
      this.updateCoordinateBadge(point);
      this.renderStage();
    }

    pointerMove(event) {
      const point = this.pointFromEvent(event);
      if (!point) return;
      this.updateCoordinateBadge(point);
      if (!this.draftPoints || event.pointerId !== this.pointerId) return;
      event.preventDefault();
      const previous = this.draftPoints[this.draftPoints.length - 1];
      if (Math.hypot(point.x - previous.x, point.y - previous.y) < 0.22) return;
      this.draftPoints.push(point);
      this.renderStage();
    }

    pointerUp(event) {
      if (!this.draftPoints || event.pointerId !== this.pointerId) return;
      event.preventDefault();
      this.svg.releasePointerCapture?.(event.pointerId);
      let points = simplifyPath(this.draftPoints);
      if (points.length === 1) {
        points = [points[0], { x: clamp(points[0].x + 0.01, 0, 100), y: points[0].y }];
      }
      const annotation = {
        id: this.nextId++,
        type: this.activeType,
        note: '',
        points: points.map(point => ({ x: round(point.x, 3), y: round(point.y, 3) }))
      };
      this.annotations.push(annotation);
      this.selectedId = annotation.id;
      this.draftPoints = null;
      this.pointerId = null;
      this.renderAll();
      this.saveDraft();
      requestAnimationFrame(() => this.selectedNote?.focus());
    }

    updateCoordinateBadge(point) {
      const world = mapToWorld(point);
      this.coordinateBadge.textContent = `HARİTA ${round(point.x, 1)}, ${round(point.y, 1)} · WORLD ${Math.round(world.x)}, ${Math.round(world.y)}`;
      this.coordinateBadge.classList.add('is-visible');
    }

    appendPath(group, points, type, className = '') {
      const data = pathData(points);
      if (!data) return;
      const halo = createSvgElement('path', {
        d: data,
        class: `cmr-map-path__halo ${className}`.trim()
      });
      const line = createSvgElement('path', {
        d: data,
        class: `cmr-map-path ${className}`.trim(),
        stroke: type.color,
        'marker-end': `url(#cmr-arrow-${Object.keys(TOOL_TYPES).find(key => TOOL_TYPES[key] === type) || 'note'})`
      });
      if (type.dash) line.setAttribute('stroke-dasharray', '1.2 0.8');
      group.append(halo, line);
    }

    renderStage() {
      this.annotationLayer.replaceChildren();
      this.annotations.forEach((annotation, index) => {
        const type = TOOL_TYPES[annotation.type] || TOOL_TYPES.note;
        const group = createSvgElement('g', {
          class: `cmr-map-annotation ${annotation.id === this.selectedId ? 'is-selected' : ''}`,
          'data-annotation-id': annotation.id
        });
        this.appendPath(group, annotation.points, type);
        const start = annotation.points[0];
        const end = annotation.points[annotation.points.length - 1];
        group.append(createSvgElement('circle', {
          cx: start.x,
          cy: start.y,
          r: 0.72,
          fill: type.color,
          class: 'cmr-map-start'
        }));
        const badge = createSvgElement('g', {
          class: 'cmr-map-number',
          transform: `translate(${end.x} ${end.y})`
        });
        badge.append(
          createSvgElement('circle', { r: 1.35, fill: '#06101a', stroke: type.color, 'stroke-width': 0.38 }),
          createSvgElement('text', {
            x: 0,
            y: 0.08,
            fill: '#ffffff',
            'font-size': 1.45,
            'font-family': 'JetBrains Mono, monospace',
            'font-weight': 800,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle'
          })
        );
        badge.lastChild.textContent = String(index + 1);
        group.append(badge);
        this.annotationLayer.append(group);
      });
      if (this.draftPoints?.length) {
        const draft = createSvgElement('g', { class: 'cmr-map-annotation is-draft' });
        this.appendPath(draft, this.draftPoints, TOOL_TYPES[this.activeType]);
        this.annotationLayer.append(draft);
      }
      this.emptyState.classList.toggle('is-hidden', this.annotations.length > 0 || Boolean(this.draftPoints));
    }

    renderAnnotationList() {
      if (!this.annotations.length) {
        this.annotationList.innerHTML = '<div class="cmr-list-empty">Henüz işaret yok. Haritanın üzerinde basılı tutup çiz.</div>';
        return;
      }
      this.annotationList.innerHTML = this.annotations.map((annotation, index) => {
        const type = TOOL_TYPES[annotation.type] || TOOL_TYPES.note;
        const start = annotation.points[0];
        const end = annotation.points[annotation.points.length - 1];
        return `
          <button type="button" class="cmr-annotation-row ${annotation.id === this.selectedId ? 'is-active' : ''}" data-cmr-select="${annotation.id}">
            <span class="cmr-annotation-row__number" style="--cmr-color:${type.color}">${index + 1}</span>
            <span>
              <strong>${escapeHtml(type.label)}</strong>
              <small>${escapeHtml(annotation.note || `${round(start.x, 1)},${round(start.y, 1)} → ${round(end.x, 1)},${round(end.y, 1)}`)}</small>
            </span>
            <i data-cmr-delete="${annotation.id}" title="İşareti sil" aria-label="İşareti sil">×</i>
          </button>
        `;
      }).join('');
    }

    renderSelectedPanel() {
      const selected = this.getSelected();
      this.selectedPanel.classList.toggle('has-selection', Boolean(selected));
      this.selectedNote.disabled = !selected;
      this.selectedNote.value = selected?.note || '';
      const title = this.selectedPanel.querySelector('[data-cmr="selected-title"]');
      const coordinates = this.selectedPanel.querySelector('[data-cmr="selected-coordinates"]');
      if (!selected) {
        title.textContent = 'Bir işaret seç';
        coordinates.textContent = 'Çizginin açıklamasını buradan ekleyebilirsin.';
        return;
      }
      const type = TOOL_TYPES[selected.type] || TOOL_TYPES.note;
      const index = this.annotations.indexOf(selected) + 1;
      const start = selected.points[0];
      const end = selected.points[selected.points.length - 1];
      title.textContent = `${index}. ${type.label}`;
      coordinates.textContent = `Başlangıç ${round(start.x, 1)}, ${round(start.y, 1)} · Bitiş ${round(end.x, 1)}, ${round(end.y, 1)}`;
    }

    renderAll() {
      this.setActiveType(this.activeType);
      this.renderStage();
      this.renderAnnotationList();
      this.renderSelectedPanel();
      const count = this.root.querySelector('[data-cmr="count"]');
      if (count) count.textContent = `${this.annotations.length} İŞARET`;
    }

    getSelected() {
      return this.annotations.find(annotation => annotation.id === this.selectedId) || null;
    }

    selectAnnotation(id) {
      if (!this.annotations.some(annotation => annotation.id === id)) return;
      this.selectedId = id;
      this.renderStage();
      this.renderAnnotationList();
      this.renderSelectedPanel();
    }

    deleteAnnotation(id) {
      const index = this.annotations.findIndex(annotation => annotation.id === id);
      if (index < 0) return;
      this.annotations.splice(index, 1);
      if (this.selectedId === id) {
        this.selectedId = this.annotations[Math.min(index, this.annotations.length - 1)]?.id ?? null;
      }
      this.renderAll();
      this.saveDraft();
    }

    undo() {
      if (!this.annotations.length) return;
      const removed = this.annotations.pop();
      if (this.selectedId === removed.id) this.selectedId = this.annotations.at(-1)?.id ?? null;
      this.renderAll();
      this.saveDraft();
    }

    clear() {
      if (this.annotations.length && !window.confirm('Haritadaki bütün işaretler silinsin mi?')) return;
      this.annotations = [];
      this.selectedId = null;
      this.renderAll();
      this.saveDraft();
      this.toast('Harita temizlendi', 'success');
    }

    contextValues() {
      const values = {};
      this.root.querySelectorAll('[data-cmr-context]').forEach(input => {
        values[input.dataset.cmrContext] = String(input.value || '').trim();
      });
      return values;
    }

    applyContext(context = {}) {
      this.root.querySelectorAll('[data-cmr-context]').forEach(input => {
        if (context[input.dataset.cmrContext] !== undefined) {
          input.value = String(context[input.dataset.cmrContext]);
        }
      });
    }

    createReport() {
      const context = this.contextValues();
      return {
        schemaVersion: 'dust2-map-report/v1',
        createdAt: new Date().toISOString(),
        map: 'de_dust2',
        mapAsset: '/assets/shooter/dust2-nav.svg',
        mapTransform: MAP_TRANSFORM,
        context,
        annotations: this.annotations.map((annotation, index) => {
          const type = TOOL_TYPES[annotation.type] || TOOL_TYPES.note;
          const normalizedPath = annotation.points.map(point => ({
            x: round(point.x, 3),
            y: round(point.y, 3)
          }));
          return {
            number: index + 1,
            id: annotation.id,
            type: annotation.type,
            typeLabel: type.label,
            color: type.color,
            note: annotation.note || '',
            normalizedPath,
            worldPath: normalizedPath.map(mapToWorld)
          };
        })
      };
    }

    createReadableReport(report) {
      const lines = [
        'DUST II HARİTA GELİŞTİRME RAPORU',
        `Sürüm: ${report.schemaVersion}`,
        `Başlık: ${report.context.title || 'Belirtilmedi'}`,
        `Bakış / takım: ${report.context.perspective || 'Belirtilmedi'}`,
        `Rakip ekonomi: ${report.context.economy || 'Belirtilmedi'}`,
        `Raunt bölümü: ${report.context.phase || 'Belirtilmedi'}`,
        `Genel açıklama: ${report.context.description || 'Yok'}`,
        ''
      ];
      report.annotations.forEach(annotation => {
        const start = annotation.normalizedPath[0];
        const end = annotation.normalizedPath[annotation.normalizedPath.length - 1];
        const worldStart = annotation.worldPath[0];
        const worldEnd = annotation.worldPath[annotation.worldPath.length - 1];
        lines.push(
          `#${annotation.number} ${annotation.typeLabel}`,
          `Açıklama: ${annotation.note || 'Yok'}`,
          `Harita koordinatı: ${start.x},${start.y} → ${end.x},${end.y}`,
          `CS dünya koordinatı: ${worldStart.x},${worldStart.y} → ${worldEnd.x},${worldEnd.y}`,
          ''
        );
      });
      lines.push('--- MAKİNECE OKUNABİLİR RAPOR ---', JSON.stringify(report, null, 2));
      return lines.join('\n');
    }

    async copyReport() {
      if (!this.annotations.length) {
        this.toast('Önce haritada en az bir işaret çizmelisin.', 'error');
        return;
      }
      const text = this.createReadableReport(this.createReport());
      try {
        await navigator.clipboard.writeText(text);
      } catch (_error) {
        const temporary = document.createElement('textarea');
        temporary.value = text;
        temporary.style.position = 'fixed';
        temporary.style.opacity = '0';
        document.body.appendChild(temporary);
        temporary.select();
        document.execCommand('copy');
        temporary.remove();
      }
      this.toast('Rapor panoya kopyalandı. Codex mesajına yapıştırabilirsin.', 'success');
    }

    downloadReport() {
      if (!this.annotations.length) {
        this.toast('Önce haritada en az bir işaret çizmelisin.', 'error');
        return;
      }
      const report = this.createReport();
      this.downloadBlob(
        new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' }),
        `${this.fileStem(report.context.title)}.json`
      );
      this.toast('Koordinatlı rapor indirildi', 'success');
    }

    async downloadPng() {
      if (!this.annotations.length) {
        this.toast('Önce haritada en az bir işaret çizmelisin.', 'error');
        return;
      }
      const report = this.createReport();
      const size = 1800;
      const headerHeight = 120;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size + headerHeight;
      const context = canvas.getContext('2d');
      context.fillStyle = '#040b12';
      context.fillRect(0, 0, canvas.width, canvas.height);

      try {
        const mapImage = new Image();
        mapImage.decoding = 'async';
        mapImage.src = `/assets/shooter/dust2-nav.svg?v=${Date.now()}`;
        await mapImage.decode();
        context.drawImage(mapImage, 0, headerHeight, size, size);
      } catch (_error) {
        this.toast('Harita görseli PNG dosyasına eklenemedi.', 'error');
        return;
      }

      report.annotations.forEach(annotation => {
        const type = TOOL_TYPES[annotation.type] || TOOL_TYPES.note;
        const points = annotation.normalizedPath.map(point => ({
          x: (point.x / 100) * size,
          y: headerHeight + ((point.y / 100) * size)
        }));
        this.drawCanvasPath(context, points, type, annotation.number);
      });

      context.fillStyle = 'rgba(4, 11, 18, 0.96)';
      context.fillRect(0, 0, size, headerHeight);
      context.fillStyle = '#ffffff';
      context.font = '800 38px Inter, sans-serif';
      context.fillText(report.context.title || 'Dust II harita geliştirme raporu', 42, 51);
      context.fillStyle = '#8fa9bb';
      context.font = '600 22px JetBrains Mono, monospace';
      const meta = `${report.context.perspective || 'Ortak'} · ${report.context.economy || 'Ekonomi bilinmiyor'} · ${report.annotations.length} işaret`;
      context.fillText(meta, 42, 91);
      context.fillStyle = '#2ea8ff';
      context.textAlign = 'right';
      context.fillText('5X5 · CS BETA MAP TOOL', size - 42, 91);
      context.textAlign = 'left';

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.96));
      if (!blob) {
        this.toast('PNG oluşturulamadı.', 'error');
        return;
      }
      this.downloadBlob(blob, `${this.fileStem(report.context.title)}.png`);
      this.toast('İşaretli Dust II görseli indirildi', 'success');
    }

    drawCanvasPath(context, points, type, number) {
      if (!points.length) return;
      const drawLine = (strokeStyle, lineWidth) => {
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach(point => context.lineTo(point.x, point.y));
        context.strokeStyle = strokeStyle;
        context.lineWidth = lineWidth;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.setLineDash(type.dash || []);
        context.stroke();
      };
      drawLine('rgba(255,255,255,0.92)', 19);
      drawLine(type.color, 12);
      context.setLineDash([]);

      const start = points[0];
      const end = points[points.length - 1];
      const previous = points[Math.max(0, points.length - 2)];
      const angle = Math.atan2(end.y - previous.y, end.x - previous.x);
      context.beginPath();
      context.arc(start.x, start.y, 10, 0, Math.PI * 2);
      context.fillStyle = type.color;
      context.fill();
      context.strokeStyle = '#ffffff';
      context.lineWidth = 4;
      context.stroke();

      context.beginPath();
      context.moveTo(end.x, end.y);
      context.lineTo(end.x - (34 * Math.cos(angle - Math.PI / 6)), end.y - (34 * Math.sin(angle - Math.PI / 6)));
      context.lineTo(end.x - (34 * Math.cos(angle + Math.PI / 6)), end.y - (34 * Math.sin(angle + Math.PI / 6)));
      context.closePath();
      context.fillStyle = type.color;
      context.fill();
      context.strokeStyle = '#ffffff';
      context.lineWidth = 4;
      context.stroke();

      context.beginPath();
      context.arc(end.x, end.y, 23, 0, Math.PI * 2);
      context.fillStyle = '#06101a';
      context.fill();
      context.strokeStyle = type.color;
      context.lineWidth = 7;
      context.stroke();
      context.fillStyle = '#ffffff';
      context.font = '800 26px JetBrains Mono, monospace';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(String(number), end.x, end.y + 1);
      context.textAlign = 'left';
      context.textBaseline = 'alphabetic';
    }

    fileStem(title) {
      const base = String(title || 'dust2-harita-raporu')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
      return `${base || 'dust2-harita-raporu'}-${new Date().toISOString().slice(0, 10)}`;
    }

    downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async importReport(file) {
      if (!file) return;
      try {
        const report = JSON.parse(await file.text());
        if (report?.schemaVersion !== 'dust2-map-report/v1' || report.map !== 'de_dust2' || !Array.isArray(report.annotations)) {
          throw new Error('Bu dosya geçerli bir Dust II harita raporu değil.');
        }
        const annotations = report.annotations.map((annotation, index) => {
          const points = (annotation.normalizedPath || [])
            .filter(point => Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)))
            .map(point => ({ x: clamp(point.x, 0, 100), y: clamp(point.y, 0, 100) }));
          if (points.length < 2) throw new Error(`${index + 1}. işaretin koordinatları eksik.`);
          return {
            id: index + 1,
            type: TOOL_TYPES[annotation.type] ? annotation.type : 'note',
            note: String(annotation.note || '').slice(0, 500),
            points
          };
        });
        this.annotations = annotations;
        this.nextId = annotations.length + 1;
        this.selectedId = annotations.at(-1)?.id ?? null;
        this.applyContext(report.context || {});
        this.renderAll();
        this.saveDraft();
        this.toast('Harita raporu açıldı', 'success');
      } catch (error) {
        this.toast(error.message || 'Rapor açılamadı.', 'error');
      } finally {
        this.fileInput.value = '';
      }
    }

    handleAction(action) {
      if (action === 'undo') this.undo();
      else if (action === 'clear') this.clear();
      else if (action === 'copy') this.copyReport();
      else if (action === 'download-json') this.downloadReport();
      else if (action === 'download-png') this.downloadPng();
      else if (action === 'open') this.fileInput.click();
    }

    saveDraft() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          activeType: this.activeType,
          nextId: this.nextId,
          selectedId: this.selectedId,
          annotations: this.annotations,
          context: this.contextValues()
        }));
      } catch (_error) {
        // Depolama engellenirse araç yine mevcut oturumda çalışmaya devam eder.
      }
    }

    loadDraft() {
      try {
        const draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (!draft || !Array.isArray(draft.annotations)) return;
        this.activeType = TOOL_TYPES[draft.activeType] ? draft.activeType : 'blocked';
        this.annotations = draft.annotations
          .filter(annotation => Array.isArray(annotation.points) && annotation.points.length >= 2)
          .map((annotation, index) => ({
            id: Number(annotation.id) || index + 1,
            type: TOOL_TYPES[annotation.type] ? annotation.type : 'note',
            note: String(annotation.note || '').slice(0, 500),
            points: annotation.points.map(point => ({
              x: clamp(point.x, 0, 100),
              y: clamp(point.y, 0, 100)
            }))
          }));
        this.nextId = Math.max(Number(draft.nextId) || 1, ...this.annotations.map(item => item.id + 1));
        this.selectedId = this.annotations.some(item => item.id === Number(draft.selectedId))
          ? Number(draft.selectedId)
          : (this.annotations.at(-1)?.id ?? null);
        requestAnimationFrame(() => this.applyContext(draft.context || {}));
      } catch (_error) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    toast(message, type = 'success') {
      if (window.App?.showToast) window.App.showToast(message, type);
    }
  }

  function render({ rootId = 'cs-map-reporter' } = {}) {
    const toolButtons = Object.entries(TOOL_TYPES).map(([key, type]) => `
      <button type="button" class="cmr-tool ${key === 'blocked' ? 'is-active' : ''}" data-cmr-tool="${key}" aria-pressed="${key === 'blocked'}" style="--cmr-color:${type.color}">
        <span>${type.icon}</span>
        <strong>${escapeHtml(type.label)}</strong>
      </button>
    `).join('');
    const markers = Object.entries(TOOL_TYPES).map(([key, type]) => `
      <marker id="cmr-arrow-${key}" viewBox="0 0 3 3" refX="2.4" refY="1.5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
        <path d="M 0 0 L 3 1.5 L 0 3 z" fill="${type.color}" stroke="#ffffff" stroke-width=".18"></path>
      </marker>
    `).join('');
    return `
      <section class="cmr-shell" id="${escapeHtml(rootId)}">
        <header class="cmr-header">
          <div>
            <span class="cmr-eyebrow">GELİŞTİRME ARACI · DUST II</span>
            <h3>CS Harita Editörü</h3>
            <p>Hatayı haritanın üzerinde çiz, koşulunu anlat ve PNG + koordinatlı raporu Codex’e gönder.</p>
          </div>
          <div class="cmr-draft-state">
            <i></i>
            <span>Taslak otomatik kaydedilir</span>
            <strong data-cmr="count">0 İŞARET</strong>
          </div>
        </header>

        <div class="cmr-workspace">
          <aside class="cmr-panel cmr-tools-panel">
            <div class="cmr-panel-heading">
              <span>1</span>
              <div><strong>İşaret türü</strong><small>Sonra haritada sürükleyerek çiz</small></div>
            </div>
            <div class="cmr-tool-grid">${toolButtons}</div>
            <p class="cmr-tool-help" data-cmr="tool-help">${TOOL_TYPES.blocked.description}</p>
            <div class="cmr-edit-actions">
              <button type="button" data-cmr-action="undo">↶ Son çizimi geri al</button>
              <button type="button" data-cmr-action="clear">Haritayı temizle</button>
            </div>
            <div class="cmr-panel-heading cmr-panel-heading--list">
              <span>2</span>
              <div><strong>İşaretler</strong><small>Seçip açıklamasını düzenle</small></div>
            </div>
            <div class="cmr-annotation-list" data-cmr="annotation-list"></div>
          </aside>

          <main class="cmr-map-column">
            <div class="cmr-map-frame">
              <div class="cmr-map-topline">
                <span>DE_DUST2 · CS2 NAV · 2248 ALAN</span>
                <b>ÇİZİM MODU</b>
              </div>
              <svg class="cmr-map" data-cmr="canvas" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" tabindex="0" aria-label="İşaretlenebilir Dust II haritası">
                <defs>${markers}</defs>
                <image href="/assets/shooter/dust2-nav.svg" x="0" y="0" width="100" height="100"></image>
                <g data-cmr="annotations"></g>
              </svg>
              <div class="cmr-map-empty" data-cmr="empty">
                <span>✎</span>
                <strong>Haritada basılı tut ve oku çiz</strong>
                <small>Fare, kalem veya dokunmatik ekran kullanabilirsin</small>
              </div>
              <div class="cmr-coordinate-badge" data-cmr="coordinates"></div>
            </div>
            <div class="cmr-map-tip">
              <span>İPUCU</span>
              <p>Başlangıçtan hedefe doğru çiz. Okun yönü, oyuncunun hareket veya bakış yönü olarak rapora girer.</p>
            </div>
          </main>

          <aside class="cmr-panel cmr-report-panel">
            <div class="cmr-panel-heading">
              <span>3</span>
              <div><strong>Durumu anlat</strong><small>AI kararını etkileyen koşulları ekle</small></div>
            </div>
            <label class="cmr-field">
              <span>Rapor başlığı</span>
              <input class="input" data-cmr-context="title" maxlength="100" placeholder="Örn. A short duvar geçişi">
            </label>
            <div class="cmr-field-row">
              <label class="cmr-field">
                <span>Bakış / takım</span>
                <select class="input" data-cmr-context="perspective">
                  <option value="T tarafı">T tarafı</option>
                  <option value="CT tarafı">CT tarafı</option>
                  <option value="Her iki takım">Her iki takım</option>
                </select>
              </label>
              <label class="cmr-field">
                <span>Rakip ekonomi</span>
                <select class="input" data-cmr-context="economy">
                  <option value="Bilinmiyor">Bilinmiyor</option>
                  <option value="Eco">Eco</option>
                  <option value="Force buy">Force buy</option>
                  <option value="Full buy">Full buy</option>
                  <option value="Fark etmez">Fark etmez</option>
                </select>
              </label>
            </div>
            <label class="cmr-field">
              <span>Raunt bölümü</span>
              <select class="input" data-cmr-context="phase">
                <option value="Raunt başlangıcı">Raunt başlangıcı</option>
                <option value="Orta raunt">Orta raunt</option>
                <option value="Execute / site girişi">Execute / site girişi</option>
                <option value="Post-plant">Post-plant</option>
                <option value="Retake">Retake</option>
                <option value="Her zaman">Her zaman</option>
              </select>
            </label>
            <label class="cmr-field">
              <span>Genel açıklama</span>
              <textarea class="input" data-cmr-context="description" maxlength="1200" rows="5" placeholder="Oyuncular şu an ne yapıyor, gerçekte ne yapmaları gerekiyor?"></textarea>
            </label>

            <div class="cmr-selected-panel" data-cmr="selected-panel">
              <span>SEÇİLİ İŞARET</span>
              <strong data-cmr="selected-title">Bir işaret seç</strong>
              <small data-cmr="selected-coordinates">Çizginin açıklamasını buradan ekleyebilirsin.</small>
              <textarea class="input" data-cmr="selected-note" maxlength="500" rows="3" disabled placeholder="Örn. Bu duvar yürüyerek veya zıplayarak aşılamaz."></textarea>
            </div>

            <div class="cmr-panel-heading cmr-panel-heading--export">
              <span>4</span>
              <div><strong>Codex’e gönder</strong><small>Görsel ve koordinat aynı raporda eşleşir</small></div>
            </div>
            <div class="cmr-export-grid">
              <button type="button" class="btn btn-primary" data-cmr-action="download-png">PNG İndir</button>
              <button type="button" class="btn btn-secondary" data-cmr-action="copy">Raporu Kopyala</button>
              <button type="button" class="btn btn-secondary" data-cmr-action="download-json">JSON İndir</button>
              <button type="button" class="btn btn-secondary" data-cmr-action="open">Rapor Aç</button>
            </div>
            <input type="file" data-cmr="file-input" accept="application/json,.json" hidden>
            <p class="cmr-send-hint">En iyi sonuç için PNG’yi mesaja ekle, ardından “Raporu Kopyala” ile koordinatları aynı mesaja yapıştır.</p>
          </aside>
        </div>
      </section>
    `;
  }

  window.CsMapReporter = {
    render,
    mount(rootId = 'cs-map-reporter') {
      const root = document.getElementById(rootId);
      return root ? new Dust2MapReporter(root) : null;
    },
    TOOL_TYPES,
    MAP_TRANSFORM
  };
})();
