// ============================================================
// folding.js — 折纸折叠模拟引擎
// 端口自 Oriedita (origami/crease_pattern/worker/WireFrame_Worker,
// PointSet, OritaCalc)
// ============================================================

// 迷你 Point（与 index.html 的 Point 兼容，确保此文件独立可用）
if (typeof Point === 'undefined') {
  class Point {
    constructor(x, y) { this.x = x; this.y = y; }
    distance(o) { return Math.sqrt((this.x - o.x) ** 2 + (this.y - o.y) ** 2); }
    angleTo(o) {
      const dx = o.x - this.x, dy = o.y - this.y;
      let a = Math.atan2(dy, dx) * 180 / Math.PI;
      return a < 0 ? a + 360 : a;
    }
  }
}

/**
 * FoldedFace — 折叠后一个面片的表示
 */
class FoldedFace {
  constructor(points, originalFaceId) {
    this.points = points;       // 折叠后的坐标 [{x,y}, ...]
    this.originalFaceId = originalFaceId;
    this.depth = 0;             // 距参考面的步数
    this.height = 0;            // 折叠视觉高度（M=+1, V=-1，可负）
    this.overlapGroupId = -1;   // 所属重叠组（-1=不重叠）
    this.layerIndex = 0;        // 组内层级（0=底层）
    this.topoOrder = 0;         // 拓扑排序位置（Step 3，0=最底层）
    this.flipped = false;       // 经奇数次反射=反面
  }
}

/**
 * FoldedFigure — 折叠结果
 */
class FoldedFigure {
  constructor() {
    this.faces = [];            // FoldedFace[]
    this.foldedLines = [];     // 折叠后的线段 [{a,b,color}...]
    this.startingFaceId = 0;
    this.overlapGroups = [];   // 重叠组 int[][]（每个元素是 faces[] 的索引）
    this.subFaces = [];        // SubFace[] — 三角剖分子面片
    this.faceFoldedLineIdx = []; // 面→折线索引（逐层遮挡用）
    this.solutions = [];       // 多解：每个解是 {layerMap: Map<faceId, layer>}
    this.currentSolution = 0;  // 当前解的索引
  }
}

/**
 * SubFace — 三角剖分后的子面片，每个三角形有独立的 stackSize
 */
class SubFace {
  constructor(points, originalFaceId, stackSize) {
    this.points = points;             // 三角形顶点 [{x,y}, {x,y}, {x,y}]
    this.originalFaceId = originalFaceId;  // 所属原始面片
    this.stackSize = stackSize;       // 该区域的重叠面片数（1=独占）
  }
}

// ---- ItalianoAlgorithm：增量传递闭包（Step 3）----
// 维护面片间 "above/below" 关系的传递闭包 DAG
// 参考：Italiano, G.F. "Amortized efficiency of a path retrieval data structure" (1986)
class ItalianoAlgorithm {
  constructor(n) {
    this.n = n;
    // matrix[i][j] = true 表示面片 i 在面片 j 之上
    this.matrix = Array.from({ length: n }, () => new Array(n).fill(false));
    this.relationCount = 0;
  }

  // 尝试添加关系：a 在 b 之上。成功返回 true，矛盾返回 false
  tryAdd(a, b) {
    if (a === b) return true;
    if (this.matrix[b][a]) return false; // 矛盾：已知 b above a
    if (this.matrix[a][b]) return true;  // 已存在

    this.matrix[a][b] = true;
    this.relationCount++;
    this._updateClosure(a, b);
    return true;
  }

  // O(n²) 更新传递闭包：所有 x above a → x above (b 及 b 之下的一切)
  _updateClosure(a, b) {
    const aboveA = [a];
    const belowB = [b];

    for (let i = 0; i < this.n; i++) {
      if (this.matrix[i][a]) aboveA.push(i);
      if (this.matrix[b][i]) belowB.push(i);
    }

    for (const x of aboveA) {
      for (const y of belowB) {
        if (!this.matrix[x][y]) {
          this.matrix[x][y] = true;
          this.relationCount++;
        }
      }
    }
  }

  // O(1) 查询
  isAbove(a, b) {
    return this.matrix[a][b];
  }

  // Kahn 拓扑排序：返回从底到顶的面片索引数组
  // priority[i] = 越小越优先（用于仅无上下关系的面的确定性排序）
  topologicalSort(priority = null) {
    const indegree = new Array(this.n).fill(0);
    for (let i = 0; i < this.n; i++) {
      for (let j = 0; j < this.n; j++) {
        if (i !== j && this.matrix[i][j]) indegree[j]++;
      }
    }

    // 优先队列：priority 小的先出（= 先画 = 更底层）
    const queue = [];
    const enq = (i) => {
      queue.push(i);
      if (priority) {
        // 插入排序保持 priority 升序
        for (let k = queue.length - 1; k > 0; k--) {
          if ((priority[queue[k]] ?? 999) < (priority[queue[k - 1]] ?? 999)) {
            [queue[k], queue[k - 1]] = [queue[k - 1], queue[k]];
          } else break;
        }
      }
    };

    for (let i = 0; i < this.n; i++) {
      if (indegree[i] === 0) enq(i);
    }

    const result = [];
    while (queue.length > 0) {
      const u = queue.shift();
      result.push(u);
      for (let v = 0; v < this.n; v++) {
        if (this.matrix[u][v]) {
          indegree[v]--;
          if (indegree[v] === 0) enq(v);
        }
      }
    }

    if (result.length < this.n) {
      const remaining = [];
      for (let i = 0; i < this.n; i++) {
        if (!result.includes(i)) remaining.push({ idx: i, deg: indegree[i] });
      }
      remaining.sort((a, b) => a.deg - b.deg);
      for (const r of remaining) result.push(r.idx);
    }

    return result;
  }
}

/**
 * FoldingEngine — 折叠模拟引擎
 *
 * 用法：
 *   const engine = new FoldingEngine(cp.lines);
 *   const ok = engine.extractFaces();
 *   if (!ok) { console.log('面片提取失败'); return; }
 *   const result = engine.fold();
 *   result.render(ctx, camera);
 */
class FoldingEngine {
  constructor(lines) {
    // 预处理：收集唯一点，建立索引
    this.originalLines = lines;
    this.points = [];          // Point[] 唯一点列表
    this.pointMap = new Map(); // "x,y" → index
    this.lines = [];           // [{aIdx, bIdx, color}] 索引化线段
    this.adj = [];             // adj[i] = [{to, lineIdx}]  邻接表
    this.faces = [];           // Face[]  提取出的面片
    this._buildGraph();
  }

  // ---- 图构建 ----
  _buildGraph() {
    const tol = 1.0; // 端点合并容差

    // 收集唯一点
    for (const l of this.originalLines) {
      this._addPoint(l.a);
      this._addPoint(l.b);
    }

    // 初始化邻接表
    for (let i = 0; i < this.points.length; i++) {
      this.adj[i] = [];
    }

    // 构建索引化线段
    for (const l of this.originalLines) {
      const aIdx = this._findPoint(l.a);
      const bIdx = this._findPoint(l.b);
      if (aIdx === bIdx) continue; // 退化线段跳过
      const lineIdx = this.lines.length;
      this.lines.push({ aIdx, bIdx, color: l.color });
      this.adj[aIdx].push({ to: bIdx, lineIdx });
      this.adj[bIdx].push({ to: aIdx, lineIdx });
    }

    // 对每个顶点的邻接按角度排序（用于右手法则）
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      this.adj[i].sort((a, b) => {
        const angA = p.angleTo(this.points[a.to]);
        const angB = p.angleTo(this.points[b.to]);
        return angA - angB;
      });
    }

    // 去除度为 1 的悬挂边（边界边会有度1的端点，保留）
    // 暂时跳过——后续可以通过欧拉公式校验
  }

  _addPoint(pt) {
    const key = `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`;
    if (this.pointMap.has(key)) return;
    this.pointMap.set(key, this.points.length);
    this.points.push(new Point(pt.x, pt.y));
  }

  _findPoint(pt) {
    const key = `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`;
    return this.pointMap.get(key) ?? -1;
  }

  // ---- 面片提取（右手法则） ----
  // getRPoint: 从边 i→j 出发，在 j 点找到"最右转"的下一条边 j→k
  _getRPoint(i, j) {
    const adjJ = this.adj[j];
    if (adjJ.length === 0) return -1;

    // 找到 j→i 的反方向角度
    const backAngle = this.points[j].angleTo(this.points[i]);

    // 在 j 的邻接中找到"最右转"的（即从 backAngle 顺时针方向最近的）
    let best = -1;
    let bestAngleDiff = Infinity;

    for (const { to: k } of adjJ) {
      if (k === i) continue;
      let diff = this.points[j].angleTo(this.points[k]) - backAngle;
      if (diff < 0) diff += 360;
      if (diff < bestAngleDiff) {
        bestAngleDiff = diff;
        best = k;
      }
    }

    return best;
  }

  // faceRequest: 从边 i→j 出发，沿右手法则走一圈得到一个面
  _faceRequest(i, j) {
    const face = [i, j];
    let next = this._getRPoint(i, j);
    if (next < 0) return null;

    while (true) {
      const prev = face[face.length - 1];
      face.push(next);
      if (face.length > this.points.length * 2) return null; // 防止死循环
      next = this._getRPoint(prev, next);
      if (next < 0) return null;
      // 检查是否回到起点
      if (face.includes(next)) break;
    }

    // 截取到 cycle 部分
    const startIdx = face.indexOf(next);
    const cycle = face.slice(startIdx);
    const area = this._faceArea(cycle);
    // 右手法则：内部面片顺时针（面积<0），外侧面逆时针（面积>0）
    if (area > 0) return null; // 排除外侧面
    cycle.reverse();           // 内部面片反转为逆时针
    return cycle;
  }

  _faceArea(indices) {
    let area = 0;
    const n = indices.length;
    for (let i = 0; i < n; i++) {
      const a = this.points[indices[i]];
      const b = this.points[indices[(i + 1) % n]];
      area += a.x * b.y - b.x * a.y;
    }
    return area / 2;
  }

  extractFaces() {
    this.faces = [];
    const faceMap = new Map(); // 用于去重: key = 排序后的点索引串

    for (const line of this.lines) {
      const { aIdx, bIdx } = line;

      // 边 a→b 一侧的面
      let face = this._faceRequest(aIdx, bIdx);
      if (face && face.length >= 3) {
        const key = [...face].sort((a, b) => a - b).join(',');
        if (!faceMap.has(key)) {
          faceMap.set(key, true);
          this.faces.push(face);
        }
      }

      // 边 b→a 另一侧的面
      face = this._faceRequest(bIdx, aIdx);
      if (face && face.length >= 3) {
        const key = [...face].sort((a, b) => a - b).join(',');
        if (!faceMap.has(key)) {
          faceMap.set(key, true);
          this.faces.push(face);
        }
      }
    }

    // 预计算面→线索引 + 面邻接关系（避免后续 O(N²) 重复扫描）
    this._faceLinesMap = new Array(this.faces.length);
    this._faceAdj = new Array(this.faces.length); // fi → [{fj, lineIdx}]
    for (let fi = 0; fi < this.faces.length; fi++) {
      this._faceAdj[fi] = [];
      const face = this.faces[fi];
      const n = face.length;
      const lineSet = [];
      for (let i = 0; i < n; i++) {
        const a = face[i], b = face[(i + 1) % n];
        for (let li = 0; li < this.lines.length; li++) {
          const l = this.lines[li];
          if ((l.aIdx === a && l.bIdx === b) || (l.aIdx === b && l.bIdx === a)) {
            lineSet.push(li);
            break;
          }
        }
      }
      this._faceLinesMap[fi] = lineSet;
    }
    // 构建邻接表：对每条线，找出共享它的两个面
    for (let li = 0; li < this.lines.length; li++) {
      const adjFaces = [];
      for (let fi = 0; fi < this.faces.length; fi++) {
        const face = this.faces[fi];
        const l = this.lines[li];
        if (face.includes(l.aIdx) && face.includes(l.bIdx)) {
          adjFaces.push(fi);
          if (adjFaces.length >= 2) break;
        }
      }
      if (adjFaces.length === 2) {
        const [fa, fb] = adjFaces;
        this._faceAdj[fa].push({ fj: fb, lineIdx: li });
        this._faceAdj[fb].push({ fj: fa, lineIdx: li });
      }
    }

    // 验证欧拉公式 F - E + V = 1（有界平面图）
    const F = this.faces.length;
    const E = this.lines.length;
    const V = this.points.length;
    if (F > 0 && Math.abs(F - E + V - 1) > Math.max(1, F * 0.1)) {
      console.warn(`欧拉公式偏差: F=${F} E=${E} V=${V}, F-E+V=${F - E + V} (期望 1)`);
    }

    console.log(`面片提取完成: ${F} 个面, ${E} 条边, ${V} 个顶点`);
    return F > 0;
  }

  // ---- 几何折叠 ----
  // 查找两面之间的公共边（折线），返回该 line 的索引（O(1) 预计算邻接）
  _findAdjacentLine(fi, fj) {
    const adj = this._faceAdj[fi];
    if (!adj) return -1;
    for (const e of adj) if (e.fj === fj) return e.lineIdx;
    return -1;
  }

  // 获取面的所有边界线（使用预计算映射，O(1)）
  _faceLines(faceIdx) {
    return this._faceLinesMap[faceIdx] || [];
  }

  // 点关于直线的对称点
  _lineSymmetry(A, B, P) {
    // 垂足
    const dx = B.x - A.x, dy = B.y - A.y;
    const ls = dx * dx + dy * dy;
    if (ls < 1e-10) return new Point(P.x, P.y);
    const t = ((P.x - A.x) * dx + (P.y - A.y) * dy) / ls;
    const footX = A.x + t * dx;
    const footY = A.y + t * dy;
    // 对称点 = 2*垂足 - P
    return new Point(2 * footX - P.x, 2 * footY - P.y);
  }

  fold(startingFaceId = 0) {
    if (this.faces.length === 0) {
      if (!this.extractFaces()) return null;
    }

    const F = this.faces.length;
    const facePos = new Array(F).fill(0);   // 距参考面的深度(1-based)
    const nextFace = new Array(F).fill(-1); // 父面
    const assocLine = new Array(F).fill(-1); // 连接父面的折线索引

    // 自动选择参考面：面积最大的面片（纸的主体），避免边缘碎片
    if (startingFaceId >= F || startingFaceId < 0) {
      let maxArea = -1;
      for (let fi = 0; fi < F; fi++) {
        const a = Math.abs(this._faceArea(this.faces[fi]));
        if (a > maxArea) { maxArea = a; startingFaceId = fi; }
      }
    }
    facePos[startingFaceId] = 1;

    // BFS 面片行走（使用预计算邻接，O(F×degree) 代替 O(F²)）
    let currentRound = new Set([startingFaceId]);
    let depth = 1;
    let remaining = F - 1;

    while (remaining > 0 && currentRound.size > 0) {
      const nextRound = new Set();
      for (const fi of currentRound) {
        for (const { fj, lineIdx } of (this._faceAdj[fi] || [])) {
          if (facePos[fj] !== 0) continue;
          nextRound.add(fj);
          facePos[fj] = depth + 1;
          nextFace[fj] = fi;
          assocLine[fj] = lineIdx;
          remaining--;
        }
      }
      currentRound = nextRound;
      depth++;
    }

    // 预计算每个面片的折叠变换链（从面片到参考面的折线序列）
    const faceChains = new Array(F);
    for (let fi = 0; fi < F; fi++) {
      if (facePos[fi] <= 0) { faceChains[fi] = null; continue; }
      const chain = [];
      let cur = fi;
      while (cur !== startingFaceId && cur >= 0) {
        const li = assocLine[cur];
        if (li < 0) break;
        const l = this.lines[li];
        if (l.color === 'M' || l.color === 'V') {
          chain.push({ a: new Point(this.points[l.aIdx].x, this.points[l.aIdx].y), b: new Point(this.points[l.bIdx].x, this.points[l.bIdx].y) });
        }
        cur = nextFace[cur];
      }
      faceChains[fi] = chain;
    }

    // 逐面片独立变换：每个面片用自己的 chain 变换所有顶点
    // 顶点出现在多个面片中时，选 chain 最长（最深）的面片确保走完所有折线
    const V = this.points.length;
    const foldedPoints = new Array(V);
    const bestChainLen = new Array(V).fill(-1);

    for (let fi = 0; fi < F; fi++) {
      const chain = faceChains[fi];
      if (!chain) continue;
      for (const vi of this.faces[fi]) {
        if (chain.length <= bestChainLen[vi]) continue; // 已有更长链
        let p = new Point(this.points[vi].x, this.points[vi].y);
        for (const fold of chain) {
          p = this._lineSymmetry(fold.a, fold.b, p);
        }
        foldedPoints[vi] = p;
        bestChainLen[vi] = chain.length;
      }
    }
    // 未变换的顶点保持原位
    for (let vi = 0; vi < V; vi++) {
      if (bestChainLen[vi] < 0) foldedPoints[vi] = new Point(this.points[vi].x, this.points[vi].y);
    }

    // 诊断
    let movedCount = 0, sampleMoves = [];
    for (let vi = 0; vi < V; vi++) {
      const orig = this.points[vi], folded = foldedPoints[vi];
      const dx = folded.x - orig.x, dy = folded.y - orig.y;
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        movedCount++;
        if (sampleMoves.length < 3) sampleMoves.push(`v${vi}: (${orig.x.toFixed(1)},${orig.y.toFixed(1)})→(${folded.x.toFixed(1)},${folded.y.toFixed(1)})`);
      }
    }
    if (movedCount === 0) console.warn('⚠️ 无顶点移动！检查是否有 M/V 折线');

    // 构建 FoldedFigure
    const result = new FoldedFigure();
    result.startingFaceId = startingFaceId;

    // 折叠后的面
    for (let fi = 0; fi < F; fi++) {
      if (facePos[fi] <= 0) continue;
      const pts = this.faces[fi].map(i => foldedPoints[i]);
      const ff = new FoldedFace(pts, fi);
      ff.depth = facePos[fi];
      ff.flipped = faceChains[fi] ? (faceChains[fi].length % 2 === 1) : false;
      result.faces.push(ff);
    }

    // 折叠后的线段（用于轮廓线渲染），lineIdx→foldedLineIdx 映射
    const lineToFolded = new Map();
    for (let li = 0; li < this.lines.length; li++) {
      const l = this.lines[li];
      const a = foldedPoints[l.aIdx];
      const b = foldedPoints[l.bIdx];
      if (a && b) {
        const flIdx = result.foldedLines.length;
        result.foldedLines.push({ a, b, color: l.color, lineIdx: li });
        lineToFolded.set(li, flIdx);
      }
    }
    // 构建面→折线索引（用于逐层遮挡渲染）
    result.faceFoldedLineIdx = new Array(F);
    for (let fi = 0; fi < F; fi++) {
      const arr = [];
      if (facePos[fi] > 0) {
        for (const li of (this._faceLinesMap[fi] || [])) {
          const fli = lineToFolded.get(li);
          if (fli !== undefined) arr.push(fli);
        }
      }
      result.faceFoldedLineIdx[fi] = arr;
    }

    // ---- Step 2: 重叠检测 + 高度计算 ----
    const faceHeights = this._computeFaceHeights(facePos, nextFace, assocLine, startingFaceId);

    // 初始化面片高度
    for (const face of result.faces) {
      const fi = face.originalFaceId;
      face.height = faceHeights[fi] !== undefined ? faceHeights[fi] : 0;
    }

    // 构建重叠图（排除相邻面片）
    const overlapGraph = this._buildOverlapGraph(result.faces);

    // 查找重叠连通分量
    const overlapGroups = this._findOverlapGroups(overlapGraph, result.faces.length);

    // 在重叠组内分配层级（保留 Step 2 的 groupId/layerIndex 用于 alpha 衰减）
    for (const face of result.faces) {
      face.overlapGroupId = -1;
      face.layerIndex = 0;
    }
    for (let gid = 0; gid < overlapGroups.length; gid++) {
      const group = overlapGroups[gid];
      group.sort((a, b) => {
        const fa = result.faces[a], fb = result.faces[b];
        const hDiff = fa.height - fb.height;
        if (hDiff !== 0) return hDiff;
        return this._polygonArea(fa.points) - this._polygonArea(fb.points);
      });
      for (let layer = 0; layer < group.length; layer++) {
        const face = result.faces[group[layer]];
        face.overlapGroupId = gid;
        face.layerIndex = layer;
      }
    }
    result.overlapGroups = overlapGroups;

    // ---- Step 3: 层级 DAG + 拓扑排序 ----
    const { italiano, contradictionCount } = this._buildFaceHierarchy(facePos, nextFace, assocLine, result.faces);

    // 等价条件推理（3EC/4EC）扩展 DAG
    const ecInferred = this._runEquivalenceInference(result.faces, italiano);

    // 拓扑排序（EC 推理后 DAG 可能已更新）
    // 拓扑排序：复合优先级 facePos → flipped → height
    const priority = result.faces.map(f => {
      const fp = facePos[f.originalFaceId] || 0;
      const fl = f.flipped ? 0 : 1; // 背先(=下方)
      const h = Math.max(-99, Math.min(99, f.height || 0)) + 100;
      return fp * 10000 + fl * 1000 + h;
    });
    const topoOrder = italiano.topologicalSort(priority); // 底→顶

    // 将拓扑排序位置写入面片
    for (let order = 0; order < topoOrder.length; order++) {
      const faceIdx = topoOrder[order];
      result.faces[faceIdx].topoOrder = order; // 0=底, N-1=顶
    }

    // ---- SubFace 三角剖分（逐区域透明度）----
    result.subFaces = this._buildSubFaces(result.faces, overlapGroups, italiano);
    result._faceAdjForRender = this._faceAdj; // 供正反面模式折线遮挡判断

    // ---- 多解搜索（懒加载：仅初始化，不预计算全部解）----
    const solState = this._initSolutionSearch(result.faces, overlapGroups, italiano);
    result.solutions = solState.solutions;
    result.solutions._swapCandidates = solState._swapCandidates;
    result.solutions._swapIndex = solState._swapIndex;
    result.currentSolution = 0;
    // 折叠结果摘要
    const totalPairs = result.faces.length * (result.faces.length - 1) / 2;
    const dense = totalPairs > 0 ? (italiano.relationCount / totalPairs * 100).toFixed(1) : 0;
    console.log(`折叠: ${result.faces.length}面 ${overlapGroups.length}重叠组 ${italiano.relationCount}关系(${dense}%) ${result.subFaces.length}子面 ${solState._swapCandidates.length}可交换` +
      (ecInferred > 0 ? ` EC+${ecInferred}` : '') + (contradictionCount > 0 ? ` ${contradictionCount}矛盾` : ''));

    return result;
  }

  // ---- 重叠检测与透明度（Step 2）----

  _computeFaceHeights(facePos, nextFace, assocLine, startingFaceId) {
    const F = this.faces.length;
    const heights = new Array(F).fill(0);
    const visited = new Array(F).fill(false);

    // 构建子面列表（反转向量树）
    const children = new Array(F).fill(null).map(() => []);
    for (let fi = 0; fi < F; fi++) {
      if (facePos[fi] > 0 && nextFace[fi] >= 0) {
        children[nextFace[fi]].push(fi);
      }
    }

    // DFS 计算高度
    const dfs = (fi, currentHeight) => {
      visited[fi] = true;
      heights[fi] = currentHeight;
      for (const child of children[fi]) {
        if (visited[child]) continue;
        const li = assocLine[child];
        let delta = 0;
        if (li >= 0) {
          const c = this.lines[li].color;
          if (c === 'M') delta = 1;
          else if (c === 'V') delta = -1;
        }
        dfs(child, currentHeight + delta);
      }
    };

    // 从参考面开始
    if (facePos[startingFaceId] > 0) {
      dfs(startingFaceId, 0);
    }

    // 处理不连通分量
    for (let fi = 0; fi < F; fi++) {
      if (facePos[fi] > 0 && !visited[fi]) {
        dfs(fi, 0);
      }
    }

    return heights;
  }

  _polygonBbox(poly) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  }

  _bboxesOverlap(bb1, bb2) {
    return !(bb1.maxX < bb2.minX || bb2.maxX < bb1.minX ||
             bb1.maxY < bb2.minY || bb2.maxY < bb1.minY);
  }

  _pointInFoldPolygon(pt, poly) {
    let inside = false;
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const pi = poly[i], pj = poly[j];
      if ((pi.y > pt.y) !== (pj.y > pt.y) &&
          pt.x < (pj.x - pi.x) * (pt.y - pi.y) / (pj.y - pi.y) + pi.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  _foldEdgesIntersect(a1, a2, b1, b2) {
    const EPS = 1e-9;
    const dax = a2.x - a1.x, day = a2.y - a1.y;
    const dbx = b2.x - b1.x, dby = b2.y - b1.y;

    const cross = dax * dby - day * dbx;
    if (Math.abs(cross) < 1e-10) {
      // 平行/共线：检查是否在内部重叠
      const crossA = dax * (b1.y - a1.y) - day * (b1.x - a1.x);
      if (Math.abs(crossA) > 1e-10) return false; // 平行不共线

      // 共线，检查投影重叠（排除端点相触）
      const dotD = dax * dax + day * day;
      const t1 = ((b1.x - a1.x) * dax + (b1.y - a1.y) * day) / dotD;
      const t2 = ((b2.x - a1.x) * dax + (b2.y - a1.y) * day) / dotD;
      const tMin = Math.min(t1, t2), tMax = Math.max(t1, t2);
      return tMax > EPS && tMin < 1 - EPS && tMax - tMin > EPS;
    }

    // 计算交点参数
    const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / cross;
    const u = ((b1.x - a1.x) * day - (b1.y - a1.y) * dax) / cross;

    return t > EPS && t < 1 - EPS && u > EPS && u < 1 - EPS;
  }

  _foldPolygonsOverlap(polyA, polyB) {
    // 1. 包围盒快速剔除
    const bbA = this._polygonBbox(polyA);
    const bbB = this._polygonBbox(polyB);
    if (!this._bboxesOverlap(bbA, bbB)) return false;

    // 2. 点包含检测
    for (const pt of polyA) {
      if (this._pointInFoldPolygon(pt, polyB)) return true;
    }
    for (const pt of polyB) {
      if (this._pointInFoldPolygon(pt, polyA)) return true;
    }

    // 3. 边相交检测
    const nA = polyA.length, nB = polyB.length;
    for (let i = 0; i < nA; i++) {
      const a1 = polyA[i], a2 = polyA[(i + 1) % nA];
      for (let j = 0; j < nB; j++) {
        const b1 = polyB[j], b2 = polyB[(j + 1) % nB];
        if (this._foldEdgesIntersect(a1, a2, b1, b2)) return true;
      }
    }

    return false;
  }

  _buildOverlapGraph(foldedFaces) {
    const N = foldedFaces.length;
    const graph = new Array(N).fill(null).map(() => []);

    // 构建 folded 层面片索引的邻接快速排除集
    const origToIdx = new Map();
    for (let i = 0; i < N; i++) origToIdx.set(foldedFaces[i].originalFaceId, i);
    const adjSet = new Array(N).fill(null).map(() => new Set());
    for (let i = 0; i < N; i++) {
      const origI = foldedFaces[i].originalFaceId;
      for (const { fj } of (this._faceAdj[origI] || [])) {
        const j = origToIdx.get(fj);
        if (j !== undefined) adjSet[i].add(j);
      }
    }

    // 空间网格索引：只检测同单元格内的面对，避免 O(N²) 全对扫描
    const GRID = 6;
    let allMinX = Infinity, allMaxX = -Infinity, allMinY = Infinity, allMaxY = -Infinity;
    const bboxes = new Array(N);
    for (let i = 0; i < N; i++) {
      bboxes[i] = this._polygonBbox(foldedFaces[i].points);
      if (bboxes[i].minX < allMinX) allMinX = bboxes[i].minX;
      if (bboxes[i].maxX > allMaxX) allMaxX = bboxes[i].maxX;
      if (bboxes[i].minY < allMinY) allMinY = bboxes[i].minY;
      if (bboxes[i].maxY > allMaxY) allMaxY = bboxes[i].maxY;
    }
    const cellW = (allMaxX - allMinX) / GRID || 1;
    const cellH = (allMaxY - allMinY) / GRID || 1;
    const grid = new Array(GRID * GRID).fill(null).map(() => []);
    for (let i = 0; i < N; i++) {
      const bb = bboxes[i];
      const c0 = Math.max(0, Math.floor((bb.minX - allMinX) / cellW));
      const c1 = Math.min(GRID - 1, Math.floor((bb.maxX - allMinX) / cellW));
      const r0 = Math.max(0, Math.floor((bb.minY - allMinY) / cellH));
      const r1 = Math.min(GRID - 1, Math.floor((bb.maxY - allMinY) / cellH));
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++)
          grid[r * GRID + c].push(i);
    }

    const checked = new Set();
    for (const cell of grid) {
      for (let a = 0; a < cell.length; a++) {
        const i = cell[a];
        for (let b = a + 1; b < cell.length; b++) {
          const j = cell[b];
          const key = i * N + j; // i<j guaranteed by cell order
          if (checked.has(key)) continue;
          checked.add(key);
          if (adjSet[i].has(j)) continue;
          if (this._foldPolygonsOverlap(foldedFaces[i].points, foldedFaces[j].points)) {
            graph[i].push(j);
            graph[j].push(i);
          }
        }
      }
    }

    return graph;
  }

  _findOverlapGroups(graph, N) {
    const visited = new Array(N).fill(false);
    const groups = [];

    for (let i = 0; i < N; i++) {
      if (visited[i] || graph[i].length === 0) continue;
      const group = [];
      const stack = [i];
      visited[i] = true;
      while (stack.length > 0) {
        const v = stack.pop();
        group.push(v);
        for (const w of graph[v]) {
          if (!visited[w]) {
            visited[w] = true;
            stack.push(w);
          }
        }
      }
      if (group.length >= 2) groups.push(group);
    }

    return groups;
  }

  _polygonArea(points) {
    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const a = points[i], b = points[(i + 1) % n];
      area += a.x * b.y - b.x * a.y;
    }
    return Math.abs(area / 2);
  }

  // 凸多边形扇形三角剖分：返回三角形数组 [{x,y}[3]]
  _triangulateFan(poly) {
    const n = poly.length;
    if (n < 3) return [];
    if (n === 3) return [[poly[0], poly[1], poly[2]]];
    const tris = [];
    const v0 = poly[0];
    for (let i = 1; i < n - 1; i++) {
      tris.push([v0, poly[i], poly[i + 1]]);
    }
    return tris;
  }

  // 三角形重心
  _triangleCentroid(tri) {
    return {
      x: (tri[0].x + tri[1].x + tri[2].x) / 3,
      y: (tri[0].y + tri[1].y + tri[2].y) / 3
    };
  }

  // _assignLayers 已内联到 fold() 中（Step 3）

  // ---- 层级 DAG 构建（Step 3）----

  // 建立完整的面片上下关系 DAG
  // 返回 { italiano, contradictionCount }
  _buildFaceHierarchy(facePos, nextFace, assocLine, foldedFaces) {
    const N = foldedFaces.length;
    const italiano = new ItalianoAlgorithm(N);
    let contradictionCount = 0;

    const faceIdxMap = new Map();
    for (let i = 0; i < N; i++) faceIdxMap.set(foldedFaces[i].originalFaceId, i);

    // ---- Step A: 折叠树父子关系（Oriedita 规则：奇偶位决定上下）----
    // parentPos 奇 = 正面朝上，偶 = 反面朝上
    // M: 奇数位 face 在偶数位 face 之上；V: 偶数位在奇数位之上
    for (let i = 0; i < N; i++) {
      const fi = foldedFaces[i].originalFaceId;
      const parentFi = nextFace[fi];
      if (parentFi < 0) continue;
      const parentIdx = faceIdxMap.get(parentFi);
      if (parentIdx === undefined) continue;
      const li = assocLine[fi];
      if (li < 0) continue;
      const isM = this.lines[li].color === 'M';
      const parentOdd = facePos[parentFi] % 2 === 1;
      // parentOdd ? M → parent above, V → child above : M → child above, V → parent above
      if (( isM &&  parentOdd) || (!isM && !parentOdd)) {
        if (!italiano.tryAdd(parentIdx, i)) contradictionCount++;
      } else {
        if (!italiano.tryAdd(i, parentIdx)) contradictionCount++;
      }
    }

    // ---- Step B: 非树邻接（Oriedita 规则：仅奇偶不同时建立关系，同奇偶跳过）----
    for (let i = 0; i < N; i++) {
      const fi = foldedFaces[i].originalFaceId;
      for (const { fj, lineIdx } of (this._faceAdj[fi] || [])) {
        const j = faceIdxMap.get(fj);
        if (j === undefined || j <= i) continue;
        if (nextFace[fi] === fj || nextFace[fj] === fi) continue;
        const color = this.lines[lineIdx].color;
        if (color !== 'M' && color !== 'V') continue;
        if (italiano.isAbove(i, j) || italiano.isAbove(j, i)) continue;
        const oddI = facePos[fi] % 2 === 1;
        const oddJ = facePos[fj] % 2 === 1;
        if (oddI === oddJ) continue; // 同奇偶无法判定，跳过（匹配 Oriedita UNKNOWN）
        const isM = color === 'M';
        if ((isM && oddI) || (!isM && !oddI)) {
          if (!italiano.tryAdd(i, j)) contradictionCount++;
        } else {
          if (!italiano.tryAdd(j, i)) contradictionCount++;
        }
      }
    }

    // ---- Step C 已移除：不根据重叠猜测上下关系，留给 EC 推理 + 拓扑排序优先级 ----

    return { italiano, contradictionCount };
  }

  // ---- 多解搜索（极简：存未知对，点按钮时交换一组相邻对）----
  _initSolutionSearch(foldedFaces, overlapGroups, italiano) {
    const N = foldedFaces.length;
    const origToIdx = new Map();
    for (let i = 0; i < N; i++) origToIdx.set(foldedFaces[i].originalFaceId, i);

    // 收集所有可交换对（同组内无已知上下关系的面对）
    const swapCandidates = [];
    for (const group of overlapGroups) {
      const faces = group.map(i => foldedFaces[i].originalFaceId);
      for (let a = 0; a < faces.length; a++) {
        for (let b = a + 1; b < faces.length; b++) {
          const ia = origToIdx.get(faces[a]), ib = origToIdx.get(faces[b]);
          if (!italiano.isAbove(ia, ib) && !italiano.isAbove(ib, ia)) {
            // 按自然顺序排序（较浅的在前）
            const oa = foldedFaces[ia].topoOrder;
            const ob = foldedFaces[ib].topoOrder;
            swapCandidates.push({
              faceA: oa <= ob ? faces[a] : faces[b],
              faceB: oa <= ob ? faces[b] : faces[a],
              group
            });
          }
        }
      }
    }

    const firstSol = { layerMap: new Map() };
    for (const f of foldedFaces) firstSol.layerMap.set(f.originalFaceId, f.topoOrder);

    return {
      solutions: [firstSol],
      _swapCandidates: swapCandidates,
      _swapIndex: -1,
    };
  }

  // 惰性找下一个解：交换下一对相邻 UNKNOWN 面
  static _findNextSolution(result) {
    const cands = result.solutions._swapCandidates;
    if (!cands || cands.length === 0) return false;
    let next = (result.solutions._swapIndex || 0) + 1;
    if (next >= cands.length) return false;
    result.solutions._swapIndex = next;
    const base = result.solutions[0]; // 始终从原解派生
    const C = cands[next];
    const newSol = { layerMap: new Map(base.layerMap) };
    const la = newSol.layerMap.get(C.faceA), lb = newSol.layerMap.get(C.faceB);
    newSol.layerMap.set(C.faceA, lb);
    newSol.layerMap.set(C.faceB, la);
    result.solutions.push(newSol);
    return true;
  }

  // ---- SubFace 三角剖分 ----

  // 构建子面片列表：每个面片 fan-triangulate → 判断每个三角形的覆盖层数
  _buildSubFaces(foldedFaces, overlapGroups, italiano) {
    const subFaces = [];
    const N = foldedFaces.length;

    // 构建重叠组快速查找映射：faceIndex → groupId
    const faceGroupMap = new Map();
    for (let gid = 0; gid < overlapGroups.length; gid++) {
      for (const idx of overlapGroups[gid]) {
        faceGroupMap.set(idx, gid);
      }
    }

    for (let i = 0; i < N; i++) {
      const face = foldedFaces[i];
      const tris = this._triangulateFan(face.points);

      // 获取该面片所在的重叠组
      const gid = faceGroupMap.get(i);
      const groupFaces = gid !== undefined ? overlapGroups[gid] : [];

      for (const tri of tris) {
        const centroid = this._triangleCentroid(tri);
        let stackSize = 1; // 至少包含自己

        // 检查组内所有其他面片是否覆盖此三角形
        for (const j of groupFaces) {
          if (j === i) continue;
          // 只统计上方且重叠的面片
          if (italiano.isAbove(j, i)) {
            if (this._pointInFoldPolygon(centroid, foldedFaces[j].points)) {
              stackSize++;
            }
          }
        }

        subFaces.push(new SubFace(tri, face.originalFaceId, stackSize));
      }
    }

    return subFaces;
  }

  // ---- 等价条件推理（3EC/4EC，高优先级优化）----

  // 线段与多边形相交检测（排除端点接触）
  _segmentIntersectsPolygon(a, b, poly) {
    const EPS = 1e-9;
    // 检查线段与多边形各边的严格内部相交
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const p1 = poly[i], p2 = poly[(i + 1) % n];
      if (this._foldEdgesIntersect(a, b, p1, p2)) return true;
    }
    // 检查线段中点是否在多边形内部
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return this._pointInFoldPolygon(mid, poly);
  }

  // 构建 3EC 和 4EC 条件列表
  _buildEquivalenceConditions(foldedFaces) {
    const cond3EC = [];
    const cond4EC = [];
    const N = foldedFaces.length;

    // 映射 originalFaceId → foldedFaces 索引
    const faceIdxMap = new Map();
    for (let i = 0; i < N; i++) {
      faceIdxMap.set(foldedFaces[i].originalFaceId, i);
    }

    // 对每条折线，找出其两侧面片及与之相交的非邻接面片 → 3EC
    const lineAdjFaces = new Map(); // lineIdx → [faceA_originalId, faceB_originalId]

    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const fi = foldedFaces[i].originalFaceId;
        const fj = foldedFaces[j].originalFaceId;
        const li = this._findAdjacentLine(fi, fj);
        if (li >= 0) {
          if (!lineAdjFaces.has(li)) {
            lineAdjFaces.set(li, [fi, fj]);
          }
        }
      }
    }

    // 为每条折线构建 3EC
    for (const [li, adjFaces] of lineAdjFaces) {
      if (adjFaces.length < 2) continue;
      const [faceB, faceD] = adjFaces;
      const l = this.lines[li];
      const segA = this.points[l.aIdx];
      const segB = this.points[l.bIdx];

      // 查找与此折线相交的其他面片
      for (let a = 0; a < N; a++) {
        const fa = foldedFaces[a].originalFaceId;
        if (fa === faceB || fa === faceD) continue;

        // 检查面片 a 的折叠多边形是否与折线折叠线段相交
        if (this._segmentIntersectsPolygon(segA, segB, foldedFaces[a].points)) {
          cond3EC.push({ type: '3EC', a, b: faceIdxMap.get(faceB), d: faceIdxMap.get(faceD) });
        }
      }
    }

    // 4EC：查找交叉的折线对
    const lineEntries = [...lineAdjFaces.entries()];
    for (let i = 0; i < lineEntries.length; i++) {
      for (let j = i + 1; j < lineEntries.length; j++) {
        const [li1, adj1] = lineEntries[i];
        const [li2, adj2] = lineEntries[j];
        if (adj1.length < 2 || adj2.length < 2) continue;

        const l1 = this.lines[li1], l2 = this.lines[li2];
        const a1 = this.points[l1.aIdx], b1 = this.points[l1.bIdx];
        const a2 = this.points[l2.aIdx], b2 = this.points[l2.bIdx];

        // 两条折线的折叠线段是否相交
        if (this._foldEdgesIntersect(a1, b1, a2, b2)) {
          cond4EC.push({
            type: '4EC',
            a: faceIdxMap.get(adj1[0]), c: faceIdxMap.get(adj1[1]),
            b: faceIdxMap.get(adj2[0]), d: faceIdxMap.get(adj2[1])
          });
        }
      }
    }

    return { cond3EC, cond4EC };
  }

  // 应用三元等价条件 (a, b, d): hierarchy[a][b] == hierarchy[a][d]
  _apply3EC(cond, italiano, changedSet) {
    const { a, b, d } = cond;
    let changed = 0;

    // 若 a > b 已知 → 推理 a > d
    if (italiano.isAbove(a, b) && !italiano.isAbove(a, d)) {
      if (italiano.tryAdd(a, d)) { changed++; changedSet.add(`a>b→a>d`); }
    }
    // 若 b > a 已知 → 推理 d > a
    if (italiano.isAbove(b, a) && !italiano.isAbove(d, a)) {
      if (italiano.tryAdd(d, a)) { changed++; changedSet.add(`b>a→d>a`); }
    }
    // 若 a > d 已知 → 推理 a > b
    if (italiano.isAbove(a, d) && !italiano.isAbove(a, b)) {
      if (italiano.tryAdd(a, b)) { changed++; changedSet.add(`a>d→a>b`); }
    }
    // 若 d > a 已知 → 推理 b > a
    if (italiano.isAbove(d, a) && !italiano.isAbove(b, a)) {
      if (italiano.tryAdd(b, a)) { changed++; changedSet.add(`d>a→b>a`); }
    }

    return changed;
  }

  // 应用四元等价条件 (a, c, b, d)
  _apply4EC(cond, italiano, changedSet) {
    const { a, c, b, d } = cond;
    let changed = 0;

    // 规则 1: 若 a>c 且 b>d → 推理 a>d 和 c>b
    if (italiano.isAbove(a, c) && italiano.isAbove(b, d)) {
      if (!italiano.isAbove(a, d) && italiano.tryAdd(a, d)) { changed++; changedSet.add('4EC:a>c,b>d→a>d'); }
      if (!italiano.isAbove(c, b) && italiano.tryAdd(c, b)) { changed++; changedSet.add('4EC:a>c,b>d→c>b'); }
    }
    // 规则 2: 若 a>d 且 c>b → 推理 a>c 和 c>d
    if (italiano.isAbove(a, d) && italiano.isAbove(c, b)) {
      if (!italiano.isAbove(a, c) && italiano.tryAdd(a, c)) { changed++; changedSet.add('4EC:a>d,c>b→a>c'); }
      if (!italiano.isAbove(c, d) && italiano.tryAdd(c, d)) { changed++; changedSet.add('4EC:a>d,c>b→c>d'); }
    }
    // 规则 3: 若 c>a 且 d>b → 推理 c>b 和 d>a
    if (italiano.isAbove(c, a) && italiano.isAbove(d, b)) {
      if (!italiano.isAbove(c, b) && italiano.tryAdd(c, b)) { changed++; changedSet.add('4EC:c>a,d>b→c>b'); }
      if (!italiano.isAbove(d, a) && italiano.tryAdd(d, a)) { changed++; changedSet.add('4EC:c>a,d>b→d>a'); }
    }
    // 规则 4: 若 d>a 且 b>c → 推理 d>b 和 a>c
    if (italiano.isAbove(d, a) && italiano.isAbove(b, c)) {
      if (!italiano.isAbove(d, b) && italiano.tryAdd(d, b)) { changed++; changedSet.add('4EC:d>a,b>c→d>b'); }
      if (!italiano.isAbove(a, c) && italiano.tryAdd(a, c)) { changed++; changedSet.add('4EC:d>a,b>c→a>c'); }
    }

    return changed;
  }

  // 等价条件推理主循环
  _runEquivalenceInference(foldedFaces, italiano) {
    const { cond3EC, cond4EC } = this._buildEquivalenceConditions(foldedFaces);
    let totalInferred = 0;
    const MAX_ITER = 20;

    if (cond3EC.length === 0 && cond4EC.length === 0) return 0;

    for (let iter = 0; iter < MAX_ITER; iter++) {
      let roundChanged = 0;
      const changedSet = new Set();

      // 应用所有 3EC
      for (const cond of cond3EC) {
        roundChanged += this._apply3EC(cond, italiano, changedSet);
      }

      // 应用所有 4EC
      for (const cond of cond4EC) {
        roundChanged += this._apply4EC(cond, italiano, changedSet);
      }

      totalInferred += roundChanged;
      if (roundChanged === 0) break; // 固定点
    }

    return totalInferred;
  }
}

// ---- 渲染 ----
// 注意：主 render() 已设置 ctx.setTransform(dpr,0,0,dpr,0,0)，所以此处坐标均为 CSS 像素
FoldedFigure.prototype.render = function (ctx, camera, canvasW, canvasH, options = {}) {
  const {
    showFaces = true,
    faceOpacity = 0.3,
    faceColors = ['#e8b4b8', '#b8c8e8', '#b8e8c0', '#e8e0b8', '#d8b8e8', '#b8e8e0'],
    showCrease = true,
    creaseWidth = 1,
    offsetX = 0,
    offsetY = 0,
    renderMode = 0,  // 0=透明着色, 1=正反面（黄/白，不透明）
    rotation = 0     // 折叠图旋转角（弧度），绕图重心
  } = options;

  ctx.lineCap = 'round';

  // offsetX/Y 是世界坐标偏移，在 camera 变换前应用 → 随缩放/平移保持相对位置
  const hw = canvasW / 2;
  const hh = canvasH / 2;

  // 计算世界坐标重心（旋转中心）
  let figCxW = 0, figCyW = 0, figNW = 0;
  if (Math.abs(rotation) > 1e-6) {
    for (const f of this.faces)
      for (const pt of f.points) { figCxW += pt.x; figCyW += pt.y; figNW++; }
    if (figNW > 0) { figCxW /= figNW; figCyW /= figNW; }
  }
  const cosR = Math.cos(rotation), sinR = Math.sin(rotation);

  function wts(pt) {
    let px = pt.x, py = pt.y;
    if (Math.abs(rotation) > 1e-6) {
      const dx = pt.x - figCxW, dy = pt.y - figCyW;
      px = figCxW + dx * cosR - dy * sinR;
      py = figCyW + dx * sinR + dy * cosR;
    }
    return {
      x: (px - camera.x + offsetX) * camera.zoom + hw,
      y: (py - camera.y + offsetY) * camera.zoom + hh
    };
  }

  // 构建 faceId → topoOrder / flipped 快速查找
  const faceOrderMap = new Map();
  const faceFlippedMap = new Map();
  for (const f of this.faces) {
    faceOrderMap.set(f.originalFaceId, f.topoOrder);
    faceFlippedMap.set(f.originalFaceId, f.flipped);
  }

  // 画面片（优先 SubFace 三角剖分，回退原始面片）
  if (showFaces) {
    const renderItems = this.subFaces.length > 0 ? this.subFaces : this.faces;

    if (renderMode === 1) {
      // ---- 正反面模式：逐面片 fill → stroke 折线，前方遮挡后方 ----
      // 使用完整面片（非 SubFace），按拓扑排序底→顶画
      const sortedFaces = [...this.faces].sort((a, b) => {
        const oa = faceOrderMap.get(a.originalFaceId) ?? 0;
        const ob = faceOrderMap.get(b.originalFaceId) ?? 0;
        return oa - ob;
      });
      const rendered = new Set();
      for (const face of sortedFaces) {
        if (face.points.length < 3) continue;
        const fi = face.originalFaceId;
        const isBack = faceFlippedMap.get(fi) || false;

        // 1) 填充面片
        ctx.beginPath();
        const s0 = wts(face.points[0]);
        ctx.moveTo(s0.x, s0.y);
        for (let i = 1; i < face.points.length; i++) {
          const s = wts(face.points[i]);
          ctx.lineTo(s.x, s.y);
        }
        ctx.closePath();
        ctx.fillStyle = isBack ? '#ffff00' : '#f5f5f5';
        ctx.globalAlpha = 1;
        ctx.fill();
        ctx.globalAlpha = 1;

        // 2) 仅绘制邻面已渲染（下方）的折线——上方邻面由它负责
        const flIndices = this.faceFoldedLineIdx[fi] || [];
        for (const fli of flIndices) {
          const fl = this.foldedLines[fli];
          if (!fl) continue;
          let otherFace = -1;
          for (const adj of (this._faceAdjForRender || [])[fi] || []) {
            if (adj.lineIdx === fl.lineIdx) { otherFace = adj.fj; break; }
          }
          if (otherFace >= 0 && !rendered.has(otherFace)) continue;
          const sa = wts(fl.a), sb = wts(fl.b);
          ctx.beginPath();
          ctx.moveTo(sa.x, sa.y);
          ctx.lineTo(sb.x, sb.y);
          ctx.strokeStyle = '#222';
          ctx.lineWidth = creaseWidth;
          ctx.stroke();
        }
        rendered.add(fi);
      }
    } else {
      // ---- 透明着色模式（原行为）----
      const sorted = [...renderItems].sort((a, b) => {
        const oa = faceOrderMap.get(a.originalFaceId) ?? 0;
        const ob = faceOrderMap.get(b.originalFaceId) ?? 0;
        return oa - ob;
      });

      for (const item of sorted) {
        if (item.points.length < 3) continue;
        ctx.beginPath();
        const s0 = wts(item.points[0]);
        ctx.moveTo(s0.x, s0.y);
        for (let i = 1; i < item.points.length; i++) {
          const s = wts(item.points[i]);
          ctx.lineTo(s.x, s.y);
        }
        ctx.closePath();
        ctx.fillStyle = renderMode === 2 ? '#999' : faceColors[item.originalFaceId % faceColors.length];
        const alpha = item.stackSize !== undefined
          ? faceOpacity * Math.pow(0.75, Math.max(0, item.stackSize - 1))
          : (item.overlapGroupId >= 0
              ? faceOpacity * Math.max(0.57, 1 - item.layerIndex * 0.14)
              : faceOpacity);
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
        if (item.stackSize === undefined) {
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  // 画折线（正反面模式已逐面片绘制，跳过全局 pass）
  if (showCrease && renderMode !== 1) {
    const creaseColor = renderMode === 2 ? '#222' : null;
    for (const l of this.foldedLines) {
      const sa = wts(l.a), sb = wts(l.b);
      ctx.beginPath();
      ctx.moveTo(sa.x, sa.y);
      ctx.lineTo(sb.x, sb.y);
      const hex = creaseColor || ({ M: '#ee4040', V: '#4040ee', B: '#888', A: '#0cc' }[l.color] || '#888');
      ctx.strokeStyle = hex;
      ctx.lineWidth = creaseWidth;
      ctx.stroke();
    }
  }
};
