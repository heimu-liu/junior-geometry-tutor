(function () {
  'use strict';

  const ink = '#285c4d';
  const amber = '#b4762c';
  const blue = '#4286a0';
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const points = list => list.map(point => point.join(',')).join(' ');
  const line = (a, b, color = ink, extra = '') => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${color}" ${extra.includes('stroke-width=') ? '' : 'stroke-width="2.8"'} stroke-linecap="round" ${extra}/>`;
  const label = (x, y, text, color = ink, extra = '') => `<text x="${x}" y="${y}" fill="${color}" ${extra.includes('font-size=') ? '' : 'font-size="20"'} font-family="system-ui, sans-serif" ${extra}>${escape(text)}</text>`;
  const point = (p, name, dx = 10, dy = -12, color = ink) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${color}"/>${label(p[0] + dx, p[1] + dy, name, color)}`;
  const fill = (list, color) => `<polygon points="${points(list)}" fill="${color}" fill-opacity="0.12" stroke="none"/>`;
  const aux = (name, markup) => `<g data-aux="${name}">${markup}</g>`;
  const dash = 'stroke-dasharray="8 7"';
  const right = (vertex, first, second, color = ink, size = 13) => {
    const unit = target => {
      const dx = target[0] - vertex[0], dy = target[1] - vertex[1];
      const length = Math.hypot(dx, dy);
      return [dx / length * size, dy / length * size];
    };
    const a = unit(first), b = unit(second);
    return `<polyline points="${points([[vertex[0] + a[0], vertex[1] + a[1]], [vertex[0] + a[0] + b[0], vertex[1] + a[1] + b[1]], [vertex[0] + b[0], vertex[1] + b[1]]])}" fill="none" stroke="${color}" stroke-width="1.8"/>`;
  };
  const tick = (a, b, count = 1, color = ink) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    const u = [dx / length, dy / length], normal = [-u[1], u[0]];
    let markup = '';
    for (let index = 0; index < count; index++) {
      const offset = (index - (count - 1) / 2) * 7;
      const middle = [(a[0] + b[0]) / 2 + u[0] * offset, (a[1] + b[1]) / 2 + u[1] * offset];
      markup += line([middle[0] - normal[0] * 6, middle[1] - normal[1] * 6], [middle[0] + normal[0] * 6, middle[1] + normal[1] * 6], color);
    }
    return markup;
  };

  // Exact Euclidean coordinates, transformed only by a uniform scale and translation.
  // Diagram coordinates are presentation data, never evidence for a proof.
  const geometry = {
    C: [260, 400], A: [428, 400], B: [260, 232], M: [512, 400],
    P: [680, 148], N: [260, 568], Q: [708, 120], E: [512, 316], D: [680, 400]
  };

  function baseAreaDiagram() {
    const { A, B, C, M, P, N, Q } = geometry;
    return [
      line(C, M), line(B, N), line(A, B), line(B, M), line(M, P), line(N, Q),
      right(C, A, B), right(A, B, P), right(M, B, P),
      point(A, 'A', -12, 28), point(B, 'B', -26, -12), point(C, 'C', -28, 5),
      point(M, 'M', -6, 28), point(P, 'P', 12, 2), point(N, 'N', -8, 30), point(Q, 'Q', 10, -8),
      label(335, 426, '6'), label(230, 323, '6')
    ].join('');
  }

  function renderArea(methodId, stepIndex, revealed) {
    const { A, B, C, M, P, N, E, D } = geometry;
    const done = index => stepIndex > index || (stepIndex === index && revealed === true);
    let behind = '', above = '';
    if (stepIndex >= 0) {
      if (stepIndex === 0) behind += fill([A, C, N], blue);
      if (done(0)) above += aux('cn-length', line(C, N, blue) + label(158, 495, 'CN = 6', blue));
    }
    if (methodId === 'pythagoras') {
      if (stepIndex === 1) behind += fill([A, M, P], amber) + fill([A, M, N], blue);
      if (done(1)) {
        above += aux('PD', line(M, D, amber, dash) + line(P, D, blue, dash) + right(D, A, P, blue) + point(D, 'D', 10, 28, blue));
        above += aux('height-values', label(702, 278, 'PD = 9', blue) + label(542, 454, 'AD = 9', amber));
      }
      if (stepIndex === 2) behind += fill([B, C, M], amber) + (done(1) ? fill([P, D, M], blue) : '');
      if (done(2)) above += aux('unknown-length', label(460, 374, 'x', amber) + label(320, 454, 'CM = x + 6', amber));
      if (stepIndex === 3) behind += fill([A, B, P], blue);
      if (done(3)) above += aux('BP', line(B, P, blue, dash));
      if (stepIndex === 4) behind += fill([B, M, P], amber);
      if (stepIndex === 5) behind += fill([A, M, P], amber) + fill([A, M, N], blue);
      if (done(5)) above += '<g data-answer="CM">' + label(370, 630, 'CM = 9', ink, 'font-size="26" font-weight="700"') + '</g>';
    } else {
      if (stepIndex === 1) above += line(A, M, amber) + line(A, P, amber);
      if (done(1)) {
        above += aux('ME', line(M, E, amber, dash) + right(M, A, E, amber) + point(E, 'E', -27, -10, amber));
        above += aux('equal-AM-ME', tick(A, M, 1, amber) + tick(M, E, 1, amber));
      }
      if (stepIndex === 2 || stepIndex === 3) behind += fill([A, M, B], blue) + fill([E, M, P], amber);
      if (done(2)) above += aux('equal-135', label(385, 365, '135°', blue) + label(533, 338, '135°', amber));
      if (stepIndex === 4) behind += fill([A, M, B], blue) + fill([A, M, N], amber);
      if (stepIndex === 5) behind += fill([A, M, E], blue) + fill([E, M, P], amber);
      if (stepIndex === 6) behind += fill([A, M, E], amber) + fill([A, M, N], blue);
      if (done(5)) above += aux('area-relation', label(310, 630, 'S△AME = ½ S△AMN', blue));
      if (done(6)) {
        above += aux('ME-value', label(534, 374, 'ME = 3', amber));
        above += '<g data-answer="CM">' + label(390, 674, 'CM = 9', ink, 'font-size="26" font-weight="700"') + '</g>';
      }
    }
    return `<g>${behind}${baseAreaDiagram()}${above}</g>`;
  }

  const areaLesson = {
    id: 'area-ratio',
    title: '等腰直角三角形中的面积比',
    shortTitle: '面积比与辅助线',
    statementHTML: '<p>在△ABC中，∠ACB = 90°，AC = BC = 6。M在线段CA的延长线上（C、A、M依次排列）。过A作AQ ⟂ AB，过M作BM的垂线，与AQ交于P。PA的延长线与BC的延长线交于N。</p><p>已知 S<sub>△AMP</sub> = 3/2 S<sub>△AMN</sub>。</p>',
    givens: ['∠ACB = 90°，AC = BC = 6', 'C、A、M依次共线', 'AQ ⟂ AB，P在AQ上，MP ⟂ BM', 'P、A、N共线；B、C、N共线', 'S△AMP = 3/2 S△AMN'],
    goalHTML: '求 <strong>CM</strong> 的长。',
    methods: [
      {
        id: 'congruence-area',
        title: '全等与面积：补一条短线',
        requires: ['angle', 'area', 'isosceles', 'congruence'],
        steps: [
          {
            title: '先找到一个能确定的长度',
            prompt: '看△ACN：你能先找到它的两个锐角吗？',
            hint: '先用△ABC的等腰直角条件，再看AB与AN互相垂直。',
            explanation: '<p>△ABC是等腰直角三角形，所以∠CAB = 45°。又因为AN ⟂ AB，∠CAN = 90° − 45° = 45°。</p><p>∠ACN = 90°，所以∠ANC也等于45°。于是△ACN也是等腰直角三角形，<strong>CN = AC = 6</strong>。</p>'
          },
          {
            title: '补一条短线，让小三角形出现',
            prompt: '从M向上作AM的垂线，碰到AP时，会得到什么三角形？',
            hint: '把交点叫E；△AME有一个直角，也有一个45°角。',
            explanation: '<p>过M作 <strong>ME ⟂ AM</strong>，交AP于E。∠MAE = 45°，∠AME = 90°，所以△AME是等腰直角三角形。</p><p>因此 <strong>AM = ME</strong>。先记住这对相等的边，不急着求数值。</p>'
          },
          {
            title: '找两块可以比较的三角形',
            prompt: '比较蓝色△AMB和棕色△EMP：A处、E处的角分别是多少？',
            hint: 'A处的角与45°角组成平角；E处也有同样的关系。',
            explanation: '<p>C、A、M在一条直线上，所以∠MAB = 180° − 45° = 135°。</p><p>A、E、P在一条直线上，且∠AEM = 45°，所以∠MEP = 135°。</p><p>两块三角形已有 <strong>∠MAB = ∠MEP</strong>，以及上一小步找到的 <strong>AM = ME</strong>。</p>'
          },
          {
            title: '再找到一对相等的角',
            prompt: 'M处的两个小角∠AMB、∠EMP，能用同一个角来表示吗？',
            hint: '它们都与∠BME凑成90°：一个来自AM ⟂ ME，一个来自BM ⟂ MP。',
            explanation: '<p>∠AMB + ∠BME = 90°，∠BME + ∠EMP = 90°。减去同一个角，得到 <strong>∠AMB = ∠EMP</strong>。</p><p>两角和它们夹着的边分别相等，由ASA得到 <strong>△AMB ≌ △EMP</strong>。因此它们的面积也相等。</p>'
          },
          {
            title: '把面积换成同一块来比较',
            prompt: '△AMB与△AMN都以AM为底，它们的高有什么关系？',
            hint: '顶点B、N到直线AM的距离，分别就是BC、CN。',
            explanation: '<p>它们的底都是AM，高分别是BC和CN，而 <strong>BC = CN = 6</strong>，所以 S<sub>△AMB</sub> = S<sub>△AMN</sub>。</p><p>结合刚才的全等结论，得到 <strong>S<sub>△EMP</sub> = S<sub>△AMN</sub></strong>。</p>'
          },
          {
            title: '从大三角形里减去一块',
            prompt: '△AMP被ME分成哪两块？减去△EMP后，还剩多少面积？',
            hint: '整块是△AMN面积的3/2；减掉的那块恰好是△AMN面积的1倍。',
            explanation: '<p>△AMP由△AME与△EMP拼成。已知整块的面积是3/2份，△EMP占1份。</p><p>所以剩下 <strong>S<sub>△AME</sub> = (3/2 − 1)S<sub>△AMN</sub> = 1/2 S<sub>△AMN</sub></strong>。</p>'
          },
          {
            title: '用面积比找到长度',
            prompt: '△AME与△AMN有同一条底AM。面积只剩一半，对应的高呢？',
            hint: '两个高是ME与CN。再想想AM与ME是什么关系，以及题目最终求哪一段。',
            explanation: '<p>同底三角形的面积比等于高之比。因此 ME = CN ÷ 2 = 6 ÷ 2 = <strong>3</strong>。</p><p>又因为AM = ME，所以AM = 3。题目求的是CM：</p><p><strong>CM = CA + AM = 6 + 3 = 9。</strong></p>'
          }
        ]
      },
      {
        id: 'pythagoras',
        title: '勾股定理：列式求未知长度',
        requires: ['angle', 'area', 'isosceles', 'pythagoras', 'factorization'],
        steps: [
          {
            title: '先确定共底三角形的一条高',
            prompt: '△ACN为什么也是等腰直角三角形？',
            hint: '先找45°，再用三角形内角和。',
            explanation: '<p>由△ABC等腰且∠ACB = 90°，得到∠CAB = 45°。AN ⟂ AB，所以∠CAN = 45°。</p><p>∠ACN = 90°，于是∠ANC = 45°，得到 <strong>CN = AC = 6</strong>。</p>'
          },
          {
            title: '把面积比变成高的比',
            prompt: '从P向直线AM作垂线PD。PD与CN的比，应该是多少？',
            hint: '△AMP、△AMN共底AM；面积比就是两条高的比。',
            explanation: '<p>作 <strong>PD ⟂ 直线AM</strong>，垂足为D。由共同的底AM，PD / CN = 3/2，所以 <strong>PD = 9</strong>。</p><p>∠PAD = 45°，∠ADP = 90°，故△APD是等腰直角三角形，<strong>AD = PD = 9</strong>。</p>'
          },
          {
            title: '给未知长度起个名字',
            prompt: '设AM = x。用勾股定理，BM²和MP²可以怎样表示？',
            hint: '分别看直角三角形BCM与PDM。CM = x + 6；MD² = (9 − x)²。',
            explanation: '<p>设 <strong>AM = x，且x &gt; 0</strong>。则CM = x + 6。M、D都在A的同侧，所以MD的长度是9与x的差的绝对值，MD² = (9 − x)²。</p><p>由勾股定理：<br><strong>BM² = (x + 6)² + 6²</strong>；<br><strong>MP² = (9 − x)² + 9²</strong>。</p>'
          },
          {
            title: '再算出BP的平方',
            prompt: '连结BP。在直角三角形BAP中，能求出BP²吗？',
            hint: '先在△ABC、△APD里求AB²、AP²，无需求出根号形式的边长。',
            explanation: '<p>连结BP。AB² = 6² + 6² = 72，AP² = 9² + 9² = 162。</p><p>由于AB ⟂ AP，在△BAP中，<strong>BP² = AB² + AP² = 234</strong>。</p>'
          },
          {
            title: '用M处的直角列出等式',
            prompt: 'BM ⟂ MP。在△BMP中，把刚才三个平方放进哪个等式？',
            hint: 'BM² + MP² = BP²；展开后可以提出公因式。',
            explanation: '<p>由勾股定理：<br>(x + 6)² + 36 + (9 − x)² + 81 = 234。</p><p>整理得 <strong>2x² − 6x = 0</strong>，即 <strong>2x(x − 3) = 0</strong>。</p><p>x = 0或x = 3。因为M在CA的延长线上且不同于A，AM = x &gt; 0，故 <strong>x = 3</strong>。</p>'
          },
          {
            title: '回到题目要找的那一段',
            prompt: '刚才求到的是AM，题目要找的是CM。还需要怎样做？',
            hint: '沿着C—A—M，写出线段相加的关系。',
            explanation: '<p>AM = 3，CA = 6，所以 <strong>CM = CA + AM = 9</strong>。</p><p>这条方法使用勾股定理和因式分解；如果这些知识还没学过，就选另一条全等与面积的方法。</p>'
          }
        ]
      }
    ],
    render: renderArea
  };

  const median = { A: [500, 150], B: [300, 500], C: [700, 500], D: [500, 500] };
  function renderMedian(methodId, stepIndex, revealed) {
    const { A, B, C, D } = median;
    const done = index => stepIndex > index || (stepIndex === index && revealed === true);
    let behind = '', above = '';
    if (stepIndex >= 0) behind += fill([A, B, D], blue) + fill([A, C, D], amber);
    if (stepIndex === 0) above += line(A, B, blue) + line(A, C, amber) + line(B, D, blue) + line(D, C, amber);
    if (stepIndex === 1) above += line(A, D, blue, 'stroke-width="4"');
    if (done(2)) above += aux('equal-base-angles', label(412, 470, '∠1', blue) + label(538, 470, '∠2', amber));
    if (done(3)) above += '<g data-answer="perpendicular">' + right(D, A, C, blue, 18) + label(420, 596, 'AD ⟂ BC', ink, 'font-size="26" font-weight="700"') + '</g>';
    return `<g>${behind}${line(A, B)}${line(A, C)}${line(B, C)}${line(A, D)}${tick(A, B)}${tick(A, C)}${tick(B, D, 2)}${tick(D, C, 2)}${point(A, 'A', -8, -20)}${point(B, 'B', -27, 20)}${point(C, 'C', 12, 20)}${point(D, 'D', -7, 30)}${above}</g>`;
  }

  const medianLesson = {
    id: 'isosceles-median',
    title: '等腰三角形的中线为什么垂直于底边',
    shortTitle: '等腰三角形的中线',
    statementHTML: '<p>在△ABC中，AB = AC，D是BC的中点，连结AD。</p>',
    givens: ['AB = AC', 'D是BC的中点，即B、D、C共线且BD = DC'],
    goalHTML: '证明 <strong>AD ⟂ BC</strong>。',
    methods: [
      {
        id: 'sss',
        title: '三边全等，再看平角',
        requires: ['angle', 'congruence'],
        steps: [
          {
            title: '先把题目给的相等关系找齐',
            prompt: '比较△ABD与△ACD，题目已经告诉了你哪两对边相等？',
            hint: '一对来自等腰条件，一对来自“中点”。',
            explanation: '<p>题目直接给出 <strong>AB = AC</strong>。</p><p>D是BC的中点，所以 <strong>BD = DC</strong>。比较的是△ABD与△ACD，它们已经有两对对应边相等。</p>'
          },
          {
            title: '还有一条共同的边',
            prompt: '这两个三角形都用到了哪条边？它能成为第三对相等的边吗？',
            hint: '一条线段和它自己当然相等。',
            explanation: '<p><strong>AD = AD</strong>，因为AD是两个三角形的公共边。</p><p>加上AB = AC、BD = DC，三对对应边都相等，由SSS得到 <strong>△ABD ≌ △ACD</strong>。</p>'
          },
          {
            title: '全等带来了哪一对角相等',
            prompt: '全等三角形中，D处的两个角是什么关系？',
            hint: '注意对应顶点：A对应A，B对应C，D对应D。',
            explanation: '<p>全等三角形的对应角相等，所以 <strong>∠ADB = ∠ADC</strong>。</p><p>图中的∠1、∠2就是这一对角。现在只知道它们相等，还需要说明为什么它们是直角。</p>'
          },
          {
            title: '把一整个平角分成相等两份',
            prompt: 'B、D、C在同一直线上。相等的两个角合起来是180°，每个角是多少？',
            hint: '180°分成相等的两份。',
            explanation: '<p>B、D、C共线，所以∠ADB + ∠ADC = 180°。两角相等，故每个都是 <strong>90°</strong>。</p><p>因此 <strong>AD ⟂ BC</strong>。这份证明只有一条经过展开的解法，不把同一条证明换个说法充当第二种。</p>'
          }
        ]
      }
    ],
    render: renderMedian
  };

  window.GeometryLessons = [areaLesson, medianLesson];
})();
